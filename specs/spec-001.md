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
2. Parse quoted CSV values correctly using the local JavaScript CSV parser.
3. Validate required columns and reject malformed rows with a useful error.
4. Convert numeric columns to numbers and trim categorical values.
5. Preserve normalized interaction rows for model training.
6. Expose normalized catalog products and grouped users.

### Dataset split

Use 80% of the normalized interaction rows for training and hold out 20% for testing. This is the recommended balance for the available dataset: it leaves enough examples for the TensorFlow.js model to learn while reserving a meaningful independent sample for evaluation.


### Catalog normalization

Group rows by `Product_ID` and expose one product per ID. Since the source repeats IDs with varying metadata:


### User normalization

Group rows by `User_ID` and preserve IDs as strings.


## Application Changes

### Services and startup


### Training worker

Refactor `src/workers/modelTrainingWorker.js` around explicit CSV interaction data.


### Controllers and views


## Files

### New


### Expected implementation updates


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
