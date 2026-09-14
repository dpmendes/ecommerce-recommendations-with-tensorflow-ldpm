export class ProductController {
    #productView;
    #currentUser = null;
    #events;
    #productService;
    #vectorService;
    constructor({
        productView,
        events,
        productService,
        vectorService
    }) {
        this.#productView = productView;
        this.#productService = productService;
        this.#vectorService = vectorService;
        this.#events = events;
        this.init().catch(error => {
            console.error('Unable to render CSV products:', error);
        });
    }

    static init(deps) {
        return new ProductController(deps);
    }

    async init() {
        this.setupCallbacks();
        this.setupEventListeners();
        await this.#productView.whenReady();
        const products = await this.#productService.getProducts();
        this.#productView.render(products, true);
    }

    setupEventListeners() {

        this.#events.onUserSelected(async (user) => {
            this.#currentUser = user;
            this.#productView.onUserSelected(user);
            let candidateProducts = null;
            try {
                candidateProducts = await this.#vectorService?.getCandidateProductsForUser(user);
            } catch (error) {
                console.warn('Unable to retrieve Chroma recommendation candidates; using the full catalog.', error);
            }
            this.#events.dispatchRecommend({ user, candidateProducts });
        });

        this.#events.onRecommendationsReady(({ recommendations }) => {
            this.#productView.render(recommendations, false);
        });
    }

    setupCallbacks() {
        this.#productView.registerBuyProductCallback(this.handleBuyProduct.bind(this));
    }

    async handleBuyProduct(product) {
        const user = this.#currentUser;
        this.#events.dispatchPurchaseAdded({ user, product });
    }

}
