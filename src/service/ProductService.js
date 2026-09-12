export class ProductService {
    #datasetService;

    constructor({ datasetService }) {
        this.#datasetService = datasetService;
    }

    async getProducts() {
        const { products } = await this.#datasetService.getDataset();
        return products;
    }

    async getProductById(id) {
        const products = await this.getProducts();
        return products.find(product => String(product.id) === String(id));
    }

    async getProductsByIds(ids) {
        const products = await this.getProducts();
        const normalizedIds = ids.map(id => String(id));
        return products.filter(product => normalizedIds.includes(String(product.id)));
    }
}
