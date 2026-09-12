# E-commerce Recommendation System

A browser-based e-commerce recommendation application using JavaScript, TensorFlow.js, and the interaction dataset in `data/Ecommerce_Personalized_Recommendation_Dataset.csv`.

## Project Structure

- `index.html` - Main HTML file for the application
- `index.js` - Entry point for the application
- `src/view/` - Contains classes for managing the DOM and templates
- `src/controller/` - Contains controllers to connect views and services
- `src/service/` - Contains the CSV data normalization and application services
- `src/workers/` - Contains the TensorFlow.js training worker
- `data/` - Contains the CSV interaction dataset
- `data/chroma_data` - Contains the vectorized representation of the CSV data

## Setup and Run

1. Install dependencies:
```
npm install
```

2. Start the application:
```
npm start
```

3. Open your browser and navigate to `http://localhost:3000`

## Features

- User profile selection with details display
- Past purchase history display
- Product listing with "Buy Now" functionality
- Purchase tracking using sessionStorage
- CSV-derived user profiles and aggregated product catalog
- TensorFlow.js training using an 80/20 deterministic stratified split
- Ranked recommendations for the selected user

## Dataset behavior

The application parses the CSV once in `DatasetService`. Repeated `Product_ID` rows are aggregated into one catalog item using mode values for categories and brands and mean values for numeric fields. Users are grouped by `User_ID`; positive `Recommended` rows are displayed as historical positive interactions, not confirmed purchases.

The model trains on 80% of the normalized interaction rows and evaluates against the remaining 20%. The split is deterministic and stratified by `Recommended`. Normalization ranges and categorical encodings are fitted from the training partition and reused for testing and inference. `Recommended` is never used as an input feature, and `Purchase_Probability` is retained as metadata rather than used as both a target and feature.

Runtime purchases are stored in versioned browser `sessionStorage`. All data processing, model training, validation, and application logic are implemented in JavaScript; Python is not required.
