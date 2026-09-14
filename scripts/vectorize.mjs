import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChromaClient } from 'chromadb';
import { parseCsv } from '../src/service/csvParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const csvPath = path.join(projectRoot, 'data', 'Ecommerce_Personalized_Recommendation_Dataset.csv');
const productCollectionName = 'ecommerce_product_vectors';
const userCollectionName = 'ecommerce_user_vectors';
const interactionCollectionName = 'ecommerce_interaction_vectors';
const explicitEmbeddingFunction = {
  generate: async documents => documents.map(() => Array(8).fill(0))
};

const NUMERIC_FIELDS = [
  'User_Age',
  'Session_Duration_Min',
  'Pages_Viewed',
  'Previous_Purchases',
  'User_Rating',
  'Product_Price',
  'Discount_Applied',
  'Graph_Similarity_Score',
  'Federated_Cluster_ID',
  'Local_Model_Accuracy',
  'Global_Model_Weight',
  'Personalization_Factor',
  'Purchase_Probability',
  'Recommended'
];

const REQUIRED_FIELDS = [
  'User_ID',
  'Product_ID',
  'Category',
  'Brand',
  ...NUMERIC_FIELDS
];

const mean = values => values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
const mode = values => {
  const counts = new Map();
  values.forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
};

function normalizeDatasetRows(rawRows) {
  const rows = rawRows.map((row, index) => {
    const normalized = Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
    );

    NUMERIC_FIELDS.forEach(field => {
      normalized[field] = Number(normalized[field]);
      if (!Number.isFinite(normalized[field])) {
        throw new Error(`Invalid ${field} at dataset row ${index + 2}`);
      }
    });

    if (!normalized.User_ID || !normalized.Product_ID) {
      throw new Error(`Missing user or product ID at dataset row ${index + 2}`);
    }

    return normalized;
  });

  const groupedProducts = new Map();
  rows.forEach(row => {
    if (!groupedProducts.has(row.Product_ID)) groupedProducts.set(row.Product_ID, []);
    groupedProducts.get(row.Product_ID).push(row);
  });

  const products = [...groupedProducts.entries()].map(([id, productRows]) => ({
    id,
    productId: id,
    name: `Product ${id}`,
    category: mode(productRows.map(row => row.Category)),
    brand: mode(productRows.map(row => row.Brand)),
    price: mean(productRows.map(row => row.Product_Price)),
    graphSimilarityScore: mean(productRows.map(row => row.Graph_Similarity_Score)),
    federatedClusterId: mode(productRows.map(row => row.Federated_Cluster_ID)),
    localModelAccuracy: mean(productRows.map(row => row.Local_Model_Accuracy)),
    globalModelWeight: mean(productRows.map(row => row.Global_Model_Weight)),
    personalizationFactor: mean(productRows.map(row => row.Personalization_Factor)),
    purchaseProbability: mean(productRows.map(row => row.Purchase_Probability)),
    recommendationRate: mean(productRows.map(row => row.Recommended))
  }));

  const groupedUsers = new Map();
  rows.forEach(row => {
    if (!groupedUsers.has(row.User_ID)) groupedUsers.set(row.User_ID, []);
    groupedUsers.get(row.User_ID).push(row);
  });

  const users = [...groupedUsers.entries()].map(([id, userRows]) => {
    const positiveProductIds = [...new Set(
      userRows.filter(row => row.Recommended === 1).map(row => row.Product_ID)
    )];

    return {
      id,
      name: `User ${id}`,
      age: Math.round(mean(userRows.map(row => row.User_Age))),
      gender: mode(userRows.map(row => row.User_Gender)),
      location: mode(userRows.map(row => row.User_Location)),
      device: mode(userRows.map(row => row.Device_Type)),
      timeOfDay: mode(userRows.map(row => row.Time_of_Day)),
      Session_Duration_Min: mean(userRows.map(row => row.Session_Duration_Min)),
      Pages_Viewed: mean(userRows.map(row => row.Pages_Viewed)),
      Previous_Purchases: mean(userRows.map(row => row.Previous_Purchases)),
      User_Rating: mean(userRows.map(row => row.User_Rating)),
      purchases: positiveProductIds
    };
  });

  return { products, users, interactions: rows };
}

function toNumericVector(product) {
  const values = [
    Number(product.price || 0),
    Number(product.graphSimilarityScore || 0),
    Number(product.federatedClusterId || 0),
    Number(product.localModelAccuracy || 0),
    Number(product.globalModelWeight || 0),
    Number(product.personalizationFactor || 0),
    Number(product.purchaseProbability || 0),
    Number(product.recommendationRate || 0)
  ];

  return values.map(value => Number.isFinite(value) ? value : 0);
}

function toProductVector(product) {
  return [
    product.price,
    product.graphSimilarityScore,
    product.federatedClusterId,
    product.localModelAccuracy,
    product.globalModelWeight,
    product.personalizationFactor,
    product.purchaseProbability,
    product.recommendationRate
  ].map(value => Number.isFinite(Number(value)) ? Number(value) : 0);
}

function toUserVector(user, productsById, products) {
  const preferredVectors = user.purchases
    .map(productId => productsById.get(String(productId)))
    .filter(Boolean)
    .map(toProductVector);
  const vectors = preferredVectors.length ? preferredVectors : products.map(toProductVector);

  return Array.from({ length: 8 }, (_, index) => {
    const total = vectors.reduce((sum, vector) => sum + vector[index], 0);
    return total / (vectors.length || 1);
  });
}

async function resetCollections(client) {
  for (const name of [productCollectionName, userCollectionName, interactionCollectionName]) {
    try {
      await client.deleteCollection({ name });
      console.log(`Deleted stale Chroma collection: ${name}`);
    } catch (error) {
      console.warn(`Collection not present or could not be deleted: ${name}`, error.message || error);
    }
  }
}

async function main() {
  const csvText = await fs.readFile(csvPath, 'utf8');
  const parsed = parseCsv(csvText);

  const missingFields = REQUIRED_FIELDS.filter(field => !parsed.fields.includes(field));
  if (missingFields.length) {
    throw new Error(`Recommendation dataset is missing required fields: ${missingFields.join(', ')}`);
  }

  const { products, users } = normalizeDatasetRows(parsed.rows);
  const productsById = new Map(products.map(product => [String(product.id), product]));

  const client = new ChromaClient();
  await resetCollections(client);

  const productCollection = await client.getOrCreateCollection({
    name: productCollectionName,
    metadata: { source: 'csv-normalized-data', kind: 'product' },
    embeddingFunction: explicitEmbeddingFunction
  });

  const productDocuments = products.map(product => JSON.stringify({
    id: product.id,
    name: product.name,
    category: product.category,
    brand: product.brand,
    price: product.price,
    graphSimilarityScore: product.graphSimilarityScore,
    purchaseProbability: product.purchaseProbability
  }));

  const productIds = products.map(product => `product-${product.id}`);
  const productEmbeddings = products.map(product => toNumericVector(product));
  const productMetadatas = products.map(product => ({
    productId: String(product.id),
    category: product.category,
    brand: product.brand,
    name: product.name
  }));

  if (productIds.length) {
    await productCollection.add({
      ids: productIds,
      embeddings: productEmbeddings,
      metadatas: productMetadatas,
      documents: productDocuments
    });
  }

  const userCollection = await client.getOrCreateCollection({
    name: userCollectionName,
    metadata: { source: 'csv-normalized-data', kind: 'user' },
    embeddingFunction: explicitEmbeddingFunction
  });

  const userDocuments = users.map(user => JSON.stringify({
    id: user.id,
    name: user.name,
    gender: user.gender,
    location: user.location,
    device: user.device,
    timeOfDay: user.timeOfDay,
    purchases: user.purchases
  }));

  const userIds = users.map(user => `user-${user.id}`);
  const userEmbeddings = users.map(user => toUserVector(user, productsById, products));
  const userMetadatas = users.map(user => ({
    userId: String(user.id),
    gender: user.gender,
    location: user.location,
    device: user.device,
    timeOfDay: user.timeOfDay
  }));

  if (userIds.length) {
    await userCollection.add({
      ids: userIds,
      embeddings: userEmbeddings,
      metadatas: userMetadatas,
      documents: userDocuments
    });
  }

  const interactionCollection = await client.getOrCreateCollection({
    name: interactionCollectionName,
    metadata: { source: 'csv-normalized-data', kind: 'interaction' },
    embeddingFunction: {
      generate: async documents => documents.map(() => Array(NUMERIC_FIELDS.length).fill(0))
    }
  });
  const interactionIds = products.length
    ? parsed.rows.map((row, index) => `interaction-${index + 1}`)
    : [];
  const interactions = normalizeDatasetRows(parsed.rows).interactions;

  if (interactionIds.length) {
    await interactionCollection.add({
      ids: interactionIds,
      embeddings: interactions.map(row => NUMERIC_FIELDS.map(field => row[field])),
      metadatas: interactions.map(row => ({
        userId: String(row.User_ID),
        productId: String(row.Product_ID),
        recommended: row.Recommended
      })),
      documents: interactions.map(row => JSON.stringify(row))
    });
  }

  const productCount = await productCollection.count();
  const userCount = await userCollection.count();
  const interactionCount = await interactionCollection.count();
  console.log(`Chroma populated: ${productCount} product vectors in '${productCollectionName}'`);
  console.log(`Chroma populated: ${userCount} user vectors in '${userCollectionName}'`);
  console.log(`Chroma populated: ${interactionCount} interaction vectors in '${interactionCollectionName}'`);
  console.log(`Products: ${products.length}, users: ${users.length}`);
}

main().catch(error => {
  console.error('Unable to populate ChromaDB:', error);
  process.exit(1);
});
