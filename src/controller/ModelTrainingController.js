export class ModelController {
    #modelView;
    #userService;
    #datasetService;
    #vectorService;
    #events;
    #currentUser = null;
    #alreadyTrained = false;
    constructor({
        modelView,
        userService,
        datasetService,
        vectorService,
        events,
    }) {
        this.#modelView = modelView;
        this.#userService = userService;
        this.#datasetService = datasetService;
        this.#vectorService = vectorService;
        this.#events = events;

        this.init();
    }

    static init(deps) {
        return new ModelController(deps);
    }

    async init() {
        this.setupCallbacks();
    }

    setupCallbacks() {
        this.#modelView.registerTrainModelCallback(this.handleTrainModel.bind(this));
        this.#modelView.registerRunRecommendationCallback(this.handleRunRecommendation.bind(this));

        this.#events.onUserSelected((user) => {
            this.#currentUser = user;
            if (!this.#alreadyTrained) return
            this.#modelView.enableRecommendButton();
        });

        this.#events.onTrainingComplete(({ metrics } = {}) => {
            this.#alreadyTrained = true;
            if (!this.#currentUser) return
            this.#modelView.enableRecommendButton();
            this.dispatchRecommendation(this.#currentUser);
            if (metrics) console.log('Model test metrics:', metrics);
        })

        this.#events.onUsersUpdated(
            async (...data) => {
                return this.refreshUsersPurchaseData(...data);
            }
        );
        this.#events.onProgressUpdate(
            (progress) => {
                this.handleTrainingProgressUpdate(progress);
            }
        );

    }


    async handleTrainModel() {
        const dataset = await this.#datasetService.getDataset();
        this.#events.dispatchTrainModel(dataset);
    }

    handleTrainingProgressUpdate(progress) {
        this.#modelView.updateTrainingProgress(progress);
    }
    async handleRunRecommendation() {
        const currentUser = this.#currentUser;
        const updatedUser = await this.#userService.getUserById(currentUser.id);
        await this.dispatchRecommendation(updatedUser);
    }

    async dispatchRecommendation(user) {
        let candidateProducts = null;
        try {
            candidateProducts = await this.#vectorService?.getCandidateProductsForUser(user);
        } catch (error) {
            console.warn('Unable to retrieve Chroma recommendation candidates; using the full catalog.', error);
        }
        this.#events.dispatchRecommend({ user, candidateProducts });
    }

    async refreshUsersPurchaseData({ users }) {
        this.#modelView.renderAllUsersPurchases(users);
    }
}
