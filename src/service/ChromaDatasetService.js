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

const mode = values => {
    const counts = new Map();
    values.forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
    return [...counts.entries()].sort((first, second) => second[1] - first[1])[0]?.[0] || '';
};

const mean = values => values.reduce((sum, value) => sum + value, 0) / (values.length || 1);

export class ChromaDatasetService {
    #baseUrl;
    #interactionCollectionName;
    #datasetPromise;

    constructor({
        baseUrl = 'http://localhost:8000',
        interactionCollectionName = 'ecommerce_interaction_vectors'
    } = {}) {
        this.#baseUrl = baseUrl;
        this.#interactionCollectionName = interactionCollectionName;
    }

    async getDataset() {
        if (!this.#datasetPromise) {
            this.#datasetPromise = this.#loadDataset();
        }
        return this.#datasetPromise;
    }

    async #loadDataset() {
        const collectionResponse = await fetch(
            `${this.#baseUrl}/api/v2/tenants/default_tenant/databases/default_database/collections`
        );
        if (!collectionResponse.ok) {
            throw new Error(`Unable to access Chroma collections (${collectionResponse.status})`);
        }

        const collections = await collectionResponse.json();
        const collection = collections.find(item => item.name === this.#interactionCollectionName);
        if (!collection?.id || !collection.dimension) {
            throw new Error(`Chroma collection '${this.#interactionCollectionName}' is missing or empty`);
        }

        const response = await fetch(
            `${this.#baseUrl}/api/v2/tenants/default_tenant/databases/default_database/collections/${collection.id}/get`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ include: ['documents'] })
            }
        );
        if (!response.ok) {
            throw new Error(`Unable to read Chroma interactions (${response.status})`);
        }

        const result = await response.json();
        const interactions = (result.documents || []).map((document, index) => this.#normalizeRow(document, index));
        if (!interactions.length) {
            throw new Error(`Chroma collection '${this.#interactionCollectionName}' contains no interactions`);
        }

        const products = this.#createProducts(interactions);
        const productsById = new Map(products.map(product => [product.id, product]));
        const users = this.#createUsers(interactions, productsById);
        return { interactions, products, users };
    }

    #normalizeRow(document, index) {
        let row;
        try {
            row = JSON.parse(document);
        } catch (error) {
            throw new Error(`Invalid Chroma interaction document ${index + 1}: ${error.message}`);
        }

        const normalized = Object.fromEntries(
            Object.entries(row).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
        );
        NUMERIC_FIELDS.forEach(field => {
            normalized[field] = Number(normalized[field]);
            if (!Number.isFinite(normalized[field])) {
                throw new Error(`Invalid ${field} in Chroma interaction ${index + 1}`);
            }
        });
        if (!normalized.User_ID || !normalized.Product_ID) {
            throw new Error(`Missing user or product ID in Chroma interaction ${index + 1}`);
        }
        return normalized;
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
            return {
                id,
                name: `User ${id}`,
                age: Math.round(mean(rows.map(row => row.User_Age))),
                gender: mode(rows.map(row => row.User_Gender)),
                location: mode(rows.map(row => row.User_Location)),
                device: mode(rows.map(row => row.Device_Type)),
                timeOfDay: mode(rows.map(row => row.Time_of_Day)),
                Session_Duration_Min: mean(rows.map(row => row.Session_Duration_Min)),
                Pages_Viewed: mean(rows.map(row => row.Pages_Viewed)),
                Previous_Purchases: mean(rows.map(row => row.Previous_Purchases)),
                User_Rating: mean(rows.map(row => row.User_Rating)),
                purchases: positiveProductIds.map(productId => ({ ...productsById.get(productId) }))
            };
        });
    }
}
