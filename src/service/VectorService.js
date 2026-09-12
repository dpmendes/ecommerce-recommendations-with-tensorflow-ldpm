export class VectorService {
    #datasetService;
    #collectionName;
    #initialized;
    #ready;

    constructor({
        datasetService,
        collectionName = 'ecommerce_product_vectors'
    } = {}) {
        this.#datasetService = datasetService;
        this.#collectionName = collectionName;
        this.#initialized = false;
        this.#ready = false;
    }

    async initialize() {
        if (this.#initialized) {
            return this.#ready;
        }

        this.#initialized = true;

        try {
            if (typeof window !== 'undefined') {
                console.info('[VectorService] Browser vector index not active yet; using the existing TensorFlow path for now.');
                this.#ready = false;
                return false;
            }

            const { ChromaClient } = await import('chromadb');
            const client = new ChromaClient();
            const collection = await client.getOrCreateCollection({
                name: this.#collectionName,
                metadata: { source: 'csv-normalized-data' }
            });

            this.#ready = Boolean(collection);
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

        if (!this.#ready || !this.#datasetService) {
            return null;
        }

        const { products } = await this.#datasetService.getDataset();
        const purchasedIds = new Set((user?.purchases || []).map(purchase => String(purchase.id)));
        return products.filter(product => !purchasedIds.has(String(product.id)));
    }
}
