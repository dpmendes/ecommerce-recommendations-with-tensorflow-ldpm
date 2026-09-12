# Specification 001: CSV Recommendation Dataset Migration

## Objective

Replace the runtime use of `data/products.json` and `data/users.json` with the single CSV dataset at `data/Ecommerce_Personalized_Recommendation_Dataset.csv`, while retaining:

- Product browsing
- User selection and profile display
- Runtime purchase additions and removals
- TensorFlow.js model training
- Ranked, user-relevant recommendations
- Training progress and TensorFlow.js visualizations

This remains a static browser application. No backend, database, or model-serving layer is introduced.

All implementation additions and modifications must use JavaScript and the existing browser-based JavaScript toolchain. Python must not be introduced for data processing, model training, validation, scripts, or application logic.

## Decisions

- The CSV fully replaces both JSON sources.
- `Recommended` is the primary binary training target.
- Repeated `Product_ID` rows are aggregated into one browseable catalog product.
- Positive `Recommended` rows populate the existing purchase-history UI as historical positive interactions. They must not be described as confirmed purchases.
- `Purchase_Probability` remains metadata and may be used for secondary ranking or evaluation, but must not be blindly used as both target and feature.
- Existing JSON files remain in the repository until the migration is verified, but must not be fetched at runtime.

## Data Layer

Add `src/service/DatasetService.js` as the shared CSV boundary.

It must:

1. Fetch and cache the CSV once.
2. Parse quoted CSV values correctly using a real CSV parser, such as Papa Parse loaded consistently with the static application.
3. Validate required columns and reject malformed rows with a useful error.
4. Convert numeric columns to numbers and trim categorical values.
5. Preserve normalized interaction rows for model training.
6. Expose normalized catalog products and grouped users.

### Dataset split

Use 80% of the normalized interaction rows for training and hold out 20% for testing. This is the recommended balance for the available dataset: it leaves enough examples for the TensorFlow.js model to learn while reserving a meaningful independent sample for evaluation.

- Create the split in JavaScript with a deterministic seeded shuffle so results are reproducible.
- Stratify by `Recommended` where possible so both partitions contain positive and negative examples in similar proportions.
- Fit normalization ranges and categorical encodings from the training partition, then reuse that context for the test partition and recommendation inference to prevent test-data leakage.
- Use the 20% test partition only for evaluation after training; do not use its labels to update model weights.
- Report test loss, accuracy, precision, recall, F1, and ROC-AUC where the browser TensorFlow.js APIs support them.
- Keep all rows available for the final recommendation candidate catalog, but ensure held-out labels are not used as input features or training signals.

### Catalog normalization

Group rows by `Product_ID` and expose one product per ID. Since the source repeats IDs with varying metadata:

- Use the mode for categorical values such as `Category` and `Brand`.
- Use the mean for numeric values such as `Product_Price`.
- Use a stable display name derived from `Product_ID`, for example `Product P0049`.
- Expose the original `Product_ID` as the stable product `id`.
- Do not invent a `color` field; the CSV has no product color column.
- Retain useful aggregate metadata, including recommendation and probability summaries where appropriate.

### User normalization

Group rows by `User_ID` and preserve IDs as strings.

- Derive a stable display name from the ID because the CSV has no user-name column.
- Use a representative or rounded mean `User_Age`.
- Use the mode for gender, location, and device fields.
- Map each user’s positive `Recommended` rows to deduplicated catalog products for the existing `purchases` UI.
- Preserve runtime changes in session storage under a versioned key so old numeric-ID JSON data cannot be mixed with the new schema.

## Application Changes

### Services and startup

- Refactor `ProductService` to consume the normalized catalog instead of fetching `products.json`.
- Refactor `UserService` to consume grouped CSV users instead of fetching `users.json`.
- Keep existing service responsibilities and make all ID comparisons string-safe.
- Update `src/index.js` so the dataset is loaded once and passed to the services and worker controller.
- Remove the synthetic demo user unless it is needed for a dedicated empty-history test.
- Ensure the initial product and user renders wait for dataset normalization.

### Training worker

Refactor `src/workers/modelTrainingWorker.js` around explicit CSV interaction data.

- Expand the training payload to include normalized users, products, and interaction rows.
- Train one example per CSV interaction rather than generating every product pair from JSON purchase history.
- Use `Recommended` as the binary label.
- Never include `Recommended` as an input feature.
- Encode numeric features such as age, session duration, pages viewed, previous purchases, rating, price, discount, graph similarity, federated cluster, local model accuracy, global model weight, and personalization factor.
- Encode categorical features such as category, brand, gender, location, device, and time of day.
- Keep the feature encoding context identical between training and inference.
- Use aggregated catalog products as recommendation candidates.
- Return stable product IDs, display metadata, model scores, and optional clearly named dataset reference scores.
- Preserve worker progress, training-log, completion, and recommendation message contracts used by the controllers.

### Controllers and views

- Update `WorkerController` and `ModelTrainingController` for the expanded training payload.
- Remove numeric coercion from user selection in `UserView` and related controllers.
- Update product and purchase templates to display `brand` or other available CSV metadata instead of `color`.
- Keep Buy Now and purchase-removal behavior intact.
- Use product-ID lookup instead of embedding oversized objects in HTML data attributes if normalized metadata becomes too large.

## Files

### New

- `src/service/DatasetService.js`
- `specs/spec-001.md`

### Expected implementation updates

- `src/service/ProductService.js`
- `src/service/UserService.js`
- `src/index.js`
- `src/controller/ModelTrainingController.js`
- `src/controller/WorkerController.js`
- `src/controller/UserController.js`
- `src/controller/ProductController.js`
- `src/workers/modelTrainingWorker.js`
- `src/view/ProductView.js`
- `src/view/UserView.js`
- `src/view/ModelTrainingView.js`
- `src/view/templates/product-card.html`
- `src/view/templates/past-purchase.html`
- `index.html`
- `package.json`
- `README.md`

All files listed above, including the new data layer and validation checks, must be implemented in JavaScript or Markdown. No Python files or Python-based workflow are part of this specification.

## Acceptance Criteria

1. The application requests the CSV and does not request either JSON data file.
2. CSV parsing produces nonzero interactions, valid required columns, numeric values, approximately 300 unique users, and approximately 200 unique product IDs.
3. The product catalog contains one entry per `Product_ID` with no malformed duplicate entries.
4. The user selector renders CSV users with string IDs and representative profile data.
5. Positive recommendation interactions render in the selected user’s history without being represented as confirmed purchases.
6. Model training reaches 100% progress and emits finite loss and accuracy values.
7. Recommendations are nonempty, sorted by descending score, and contain stable IDs and display metadata.
8. Recommendations can differ between selected users.
9. Buying and removing products continues to work and updates session storage under the new schema.
10. Reloading the application does not reintroduce stale JSON users or products.

## Verification Plan

1. Run a data smoke check for row counts, required columns, numeric conversion, and unique IDs.
2. Start the static application and inspect the browser console and network requests.
3. Select users with and without positive interactions and verify both history paths.
4. Train from the UI and verify worker completion, progress, and TensorFlow.js logs.
5. Run recommendations for at least two users and verify ranking, metadata, and user-specific results.
6. Buy and remove an item, retrain, reload, and verify the normalized session-storage schema.
