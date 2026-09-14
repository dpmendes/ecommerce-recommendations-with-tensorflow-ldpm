export class VectorService {
    #datasetService;
    #collectionName;
    #interactionCollectionName;
    #baseUrl;
    #collectionId;
    #interactionCollectionId;
    #initialized;
    #ready;

    constructor({
        datasetService,
        collectionName = 'ecommerce_product_vectors',
        interactionCollectionName = 'ecommerce_interaction_vectors',
        baseUrl = 'http://localhost:8000'
    } = {}) {
        this.#datasetService = datasetService;
        this.#collectionName = collectionName;
        this.#interactionCollectionName = interactionCollectionName;
        this.#baseUrl = baseUrl;
        this.#collectionId = null;
        this.#interactionCollectionId = null;
        this.#initialized = false;
        this.#ready = false;
    }

    async initialize() {
        if (this.#initialized) {
            return this.#ready;
        }

        this.#initialized = true;

        try {
            const response = await fetch(
                `${this.#baseUrl}/api/v2/tenants/default_tenant/databases/default_database/collections`
            );
            if (!response.ok) throw new Error(`Chroma returned ${response.status}`);

            const collections = await response.json();
            const collection = collections.find(item => item.name === this.#collectionName);
            const interactionCollection = collections.find(
                item => item.name === this.#interactionCollectionName
            );
            this.#collectionId = collection?.id || null;
            this.#interactionCollectionId = interactionCollection?.id || null;
            this.#ready = Boolean(
                this.#collectionId && collection.dimension &&
                this.#interactionCollectionId && interactionCollection.dimension
            );
        } catch (error) {
            console.warn('[VectorService] Chroma vector index is unavailable; falling back to the current recommendation flow.', error);
            this.#ready = false;
        }

        return this.#ready;
    }

    async ensureIndexed() {
        await this.initialize();
        return this.#ready;
    }

    async getCandidateProductsForUser(user) {
        await this.initialize();

        if (!this.#ready || !this.#collectionId || !this.#datasetService) {
            return null;
        }

        const { products } = await this.#datasetService.getDataset();
        const purchasedIds = new Set((user?.purchases || []).map(purchase => String(purchase.id)));
        const response = await fetch(
            `${this.#baseUrl}/api/v2/tenants/default_tenant/databases/default_database/collections/${this.#collectionId}/query`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query_embeddings: [this.#toUserVector(user)],
                    n_results: Math.min(100, products.length),
                    include: ['metadatas']
                })
            }
        );
        if (!response.ok) throw new Error(`Chroma query returned ${response.status}`);

        const result = await response.json();
        const productIds = result.metadatas?.[0]
            ?.map(metadata => metadata?.productId)
            .filter(Boolean) || [];
        const productsById = new Map(products.map(product => [String(product.id), product]));

        return productIds
            .map(productId => productsById.get(String(productId)))
            .filter(product => product && !purchasedIds.has(String(product.id)));
    }

    async getTrainingDataset() {
        await this.initialize();

        if (!this.#ready || !this.#interactionCollectionId || !this.#datasetService) {
            return null;
        }

        const response = await fetch(
            `${this.#baseUrl}/api/v2/tenants/default_tenant/databases/default_database/collections/${this.#interactionCollectionId}/get`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ include: ['documents'] })
            }
        );
        if (!response.ok) throw new Error(`Chroma interaction read returned ${response.status}`);

        const result = await response.json();
        const interactions = (result.documents || []).map(document => JSON.parse(document));
        if (!interactions.length) return null;

        const dataset = await this.#datasetService.getDataset();
        return { ...dataset, interactions };
    }

    #toUserVector(user = {}) {
        const values = [
            Number(user.age || 0),
            Number(user.Session_Duration_Min || 0),
            Number(user.Pages_Viewed || 0),
            Number(user.Previous_Purchases || 0),
            Number(user.User_Rating || 0),
            Number(user.purchases?.length || 0),
            Number(user.Session_Duration_Min || 0) + Number(user.Pages_Viewed || 0),
            Number(user.User_Rating || 0) + Number(user.purchases?.length || 0)
        ];

        return values.map(value => Number.isFinite(value) ? value : 0);
    }
}
