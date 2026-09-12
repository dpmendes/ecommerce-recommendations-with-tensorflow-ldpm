import { parseCsv } from './csvParser.js';

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

const mode = values => {
    const counts = new Map();
    values.forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
};

const mean = values => values.reduce((sum, value) => sum + value, 0) / (values.length || 1);

const averageFields = (rows, fields) => Object.fromEntries(
    fields.map(field => [field, mean(rows.map(row => row[field]))])
);

export class DatasetService {
    #datasetPath;
    #datasetPromise;

    constructor(datasetPath = './data/Ecommerce_Personalized_Recommendation_Dataset.csv') {
        this.#datasetPath = datasetPath;
    }

    async getDataset() {
        if (!this.#datasetPromise) {
            this.#datasetPromise = this.#loadDataset();
        }
        return this.#datasetPromise;
    }

    async #loadDataset() {
        const response = await fetch(this.#datasetPath);
        if (!response.ok) {
            throw new Error(`Unable to load recommendation dataset (${response.status})`);
        }

        const csv = await response.text();
        const parsed = parseCsv(csv);

        const missingFields = REQUIRED_FIELDS.filter(field => !parsed.fields.includes(field));
        if (missingFields.length) {
            throw new Error(`Recommendation dataset is missing: ${missingFields.join(', ')}`);
        }

        const interactions = parsed.rows.map((row, index) => {
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

        const products = this.#createProducts(interactions);
        const productsById = new Map(products.map(product => [product.id, product]));
        const users = this.#createUsers(interactions, productsById);

        return { interactions, products, users };
    }

    #createProducts(interactions) {
        const grouped = new Map();
        interactions.forEach(row => {
            if (!grouped.has(row.Product_ID)) grouped.set(row.Product_ID, []);
            grouped.get(row.Product_ID).push(row);
        });

        return [...grouped.entries()].map(([id, rows]) => ({
            id,
            productId: id,
            name: `Product ${id}`,
            category: mode(rows.map(row => row.Category)),
            brand: mode(rows.map(row => row.Brand)),
            price: mean(rows.map(row => row.Product_Price)),
            graphSimilarityScore: mean(rows.map(row => row.Graph_Similarity_Score)),
            federatedClusterId: mode(rows.map(row => row.Federated_Cluster_ID)),
            localModelAccuracy: mean(rows.map(row => row.Local_Model_Accuracy)),
            globalModelWeight: mean(rows.map(row => row.Global_Model_Weight)),
            personalizationFactor: mean(rows.map(row => row.Personalization_Factor)),
            purchaseProbability: mean(rows.map(row => row.Purchase_Probability)),
            recommendationRate: mean(rows.map(row => row.Recommended))
        }));
    }

    #createUsers(interactions, productsById) {
        const grouped = new Map();
        interactions.forEach(row => {
            if (!grouped.has(row.User_ID)) grouped.set(row.User_ID, []);
            grouped.get(row.User_ID).push(row);
        });

        return [...grouped.entries()].map(([id, rows]) => {
            const positiveProductIds = [...new Set(
                rows.filter(row => row.Recommended === 1).map(row => row.Product_ID)
            )];
            const numericAverages = averageFields(rows, [
                'Session_Duration_Min',
                'Pages_Viewed',
                'Previous_Purchases',
                'User_Rating'
            ]);

            return {
                id,
                name: `User ${id}`,
                age: Math.round(mean(rows.map(row => row.User_Age))),
                gender: mode(rows.map(row => row.User_Gender)),
                location: mode(rows.map(row => row.User_Location)),
                device: mode(rows.map(row => row.Device_Type)),
                timeOfDay: mode(rows.map(row => row.Time_of_Day)),
                ...numericAverages,
                purchases: positiveProductIds.map(productId => ({ ...productsById.get(productId) }))
            };
        });
    }
}