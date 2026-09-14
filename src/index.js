import { UserController } from './controller/UserController.js';
import { ProductController } from './controller/ProductController.js';
import { ModelController } from './controller/ModelTrainingController.js';
import { TFVisorController } from './controller/TFVisorController.js';
import { TFVisorView } from './view/TFVisorView.js';
import { UserService } from './service/UserService.js';
import { ProductService } from './service/ProductService.js';
import { UserView } from './view/UserView.js';
import { ProductView } from './view/ProductView.js';
import { ModelView } from './view/ModelTrainingView.js';
import Events from './events/events.js';
import { WorkerController } from './controller/WorkerController.js';
import { ChromaDatasetService } from './service/ChromaDatasetService.js';
import { VectorService } from './service/VectorService.js';

// Create shared services
const datasetService = new ChromaDatasetService();
const vectorService = new VectorService({ datasetService });
const userService = new UserService({ datasetService });
const productService = new ProductService({ datasetService });
const dataset = await datasetService.getDataset().catch(error => {
    console.error('Unable to initialize recommendation dataset:', error);
    throw error;
});

try {
    await vectorService.initialize();
} catch (error) {
    console.error('Unable to initialize Chroma vector index.', error);
    throw error;
}

// Create views
const userView = new UserView();
const productView = new ProductView();
const modelView = new ModelView();
const tfVisorView = new TFVisorView();
const mlWorker = new Worker('/src/workers/modelTrainingWorker.js', { type: 'module' });

// Set up worker message handler
const w = WorkerController.init({
    worker: mlWorker,
    events: Events
});

ModelController.init({
    modelView,
    userService,
    datasetService,
    vectorService,
    events: Events,
});

TFVisorController.init({
    tfVisorView,
    events: Events,
});

ProductController.init({
    productView,
    userService,
    productService,
    vectorService,
    events: Events,
});


const userController = UserController.init({
    userView,
    userService,
    productService,
    events: Events,
});


userController.renderUsers().catch(error => {
    console.error('Unable to render CSV users:', error);
});

w.triggerTrain(dataset);