import 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js';
import { workerEvents } from '../events/constants.js';

let model = null;
let context = null;

const numericFields = [
    'User_Age', 'Session_Duration_Min', 'Pages_Viewed', 'Previous_Purchases',
    'User_Rating', 'Product_Price', 'Discount_Applied', 'Graph_Similarity_Score',
    'Federated_Cluster_ID', 'Local_Model_Accuracy', 'Global_Model_Weight',
    'Personalization_Factor'
];

const categoricalFields = [
    'Category', 'Brand', 'User_Gender', 'User_Location', 'Device_Type', 'Time_of_Day'
];

const userFieldMap = {
    User_Age: 'age', User_Gender: 'gender', User_Location: 'location',
    Device_Type: 'device', Time_of_Day: 'timeOfDay',
    Session_Duration_Min: 'Session_Duration_Min', Pages_Viewed: 'Pages_Viewed',
    Previous_Purchases: 'Previous_Purchases', User_Rating: 'User_Rating'
};

const productFieldMap = {
    Category: 'category', Brand: 'brand', Product_Price: 'price',
    Graph_Similarity_Score: 'graphSimilarityScore', Federated_Cluster_ID: 'federatedClusterId',
    Local_Model_Accuracy: 'localModelAccuracy', Global_Model_Weight: 'globalModelWeight',
    Personalization_Factor: 'personalizationFactor'
};

const normalize = (value, range) => (value - range.min) / ((range.max - range.min) || 1);

function seededShuffle(items) {
    const shuffled = [...items];
    let seed = 1701;
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        seed = (seed * 9301 + 49297) % 233280;
        const swapIndex = Math.floor((seed / 233280) * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
}

function splitInteractions(interactions) {
    const groups = new Map();
    interactions.forEach(row => {
        if (!groups.has(row.Recommended)) groups.set(row.Recommended, []);
        groups.get(row.Recommended).push(row);
    });

    const train = [];
    const test = [];
    groups.forEach(rows => {
        const shuffled = seededShuffle(rows);
        const testSize = Math.max(1, Math.floor(shuffled.length * 0.2));
        test.push(...shuffled.slice(0, testSize));
        train.push(...shuffled.slice(testSize));
    });
    return { train: seededShuffle(train), test: seededShuffle(test) };
}

function createContext(trainRows) {
    const numericRanges = Object.fromEntries(numericFields.map(field => {
        const values = trainRows.map(row => row[field]);
        return [field, { min: Math.min(...values), max: Math.max(...values) }];
    }));
    const categories = Object.fromEntries(categoricalFields.map(field => [
        field, [...new Set(trainRows.map(row => row[field]))].sort()
    ]));
    return { numericRanges, categories };
}

function getFieldValue(source, field) {
    if (field in source) return source[field];
    if (userFieldMap[field] in source) return source[userFieldMap[field]];
    if (productFieldMap[field] in source) return source[productFieldMap[field]];
    return 0;
}

function encode(source) {
    const numeric = numericFields.map(field => normalize(
        Number(getFieldValue(source, field)) || 0,
        context.numericRanges[field]
    ));

    const categorical = categoricalFields.flatMap(field => {
        const value = getFieldValue(source, field);
        return context.categories[field].map(item => item === value ? 1 : 0);
    });
    return [...numeric, ...categorical];
}

function buildCandidate(user, product) {
    return {
        User_Age: user.age, User_Gender: user.gender, User_Location: user.location,
        Device_Type: user.device, Time_of_Day: user.timeOfDay,
        Session_Duration_Min: user.Session_Duration_Min, Pages_Viewed: user.Pages_Viewed,
        Previous_Purchases: user.Previous_Purchases, User_Rating: user.User_Rating,
        Category: product.category, Brand: product.brand, Product_Price: product.price,
        Discount_Applied: 0, Graph_Similarity_Score: product.graphSimilarityScore,
        Federated_Cluster_ID: product.federatedClusterId,
        Local_Model_Accuracy: product.localModelAccuracy,
        Global_Model_Weight: product.globalModelWeight,
        Personalization_Factor: product.personalizationFactor
    };
}

function createTrainingTensors(rows) {
    return {
        xs: tf.tensor2d(rows.map(encode)),
        ys: tf.tensor2d(rows.map(row => [row.Recommended]))
    };
}

function calculateMetrics(labels, scores) {
    const predictions = scores.map(score => score >= 0.5 ? 1 : 0);
    let truePositive = 0;
    let trueNegative = 0;
    let falsePositive = 0;
    let falseNegative = 0;
    labels.forEach((label, index) => {
        if (label === 1 && predictions[index] === 1) truePositive += 1;
        if (label === 0 && predictions[index] === 0) trueNegative += 1;
        if (label === 0 && predictions[index] === 1) falsePositive += 1;
        if (label === 1 && predictions[index] === 0) falseNegative += 1;
    });
    const precision = truePositive / (truePositive + falsePositive || 1);
    const recall = truePositive / (truePositive + falseNegative || 1);
    const f1 = 2 * precision * recall / (precision + recall || 1);
    const accuracy = (truePositive + trueNegative) / (labels.length || 1);
    const positives = labels.filter(label => label === 1).length;
    const negatives = labels.length - positives;
    const rankedIndices = scores.map((score, index) => index)
        .sort((first, second) => scores[second] - scores[first]);
    let positiveRankSum = 0;
    rankedIndices.forEach((index, rank) => {
        if (labels[index] === 1) positiveRankSum += rank + 1;
    });
    const rocAuc = positives && negatives
        ? 1 - (positiveRankSum - positives * (positives + 1) / 2) / (positives * negatives)
        : null;
    return { accuracy, precision, recall, f1, rocAuc };
}

async function trainModel(dataset) {
    const { train, test } = splitInteractions(dataset.interactions);
    context = { ...createContext(train), products: dataset.products };
    const trainTensors = createTrainingTensors(train);
    const testTensors = createTrainingTensors(test);

    model = tf.sequential();
    model.add(tf.layers.dense({ inputShape: [trainTensors.xs.shape[1]], units: 64, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));
    model.compile({ optimizer: tf.train.adam(0.005), loss: 'binaryCrossentropy', metrics: ['accuracy'] });

    postMessage({ type: workerEvents.progressUpdate, progress: { progress: 1 } });
    await model.fit(trainTensors.xs, trainTensors.ys, {
        epochs: 40,
        batchSize: 32,
        shuffle: true,
        callbacks: {
            onEpochEnd: (epoch, logs) => postMessage({
                type: workerEvents.trainingLog,
                epoch,
                loss: logs.loss,
                accuracy: logs.acc ?? logs.accuracy
            })
        }
    });

    const testScores = model.predict(testTensors.xs).dataSync();
    const metrics = calculateMetrics(test.map(row => row.Recommended), [...testScores]);
    console.log('CSV test metrics:', metrics);
    trainTensors.xs.dispose();
    trainTensors.ys.dispose();
    testTensors.xs.dispose();
    testTensors.ys.dispose();
    postMessage({ type: workerEvents.progressUpdate, progress: { progress: 100 } });
    postMessage({ type: workerEvents.trainingComplete, metrics });
}

function recommend(user) {
    if (!model || !context) return;
    const purchasedIds = new Set((user.purchases || []).map(purchase => String(purchase.id)));
    const purchasedCategories = new Set((user.purchases || []).map(purchase => purchase.category));
    const purchasedBrands = new Set((user.purchases || []).map(purchase => purchase.brand));
    const candidates = context.products.filter(product => !purchasedIds.has(String(product.id)));
    const recommendationCandidates = candidates.length ? candidates : context.products;
    const inputs = recommendationCandidates.map(product => encode(buildCandidate(user, product)));
    const inputTensor = tf.tensor2d(inputs);
    const scores = model.predict(inputTensor).dataSync();
    inputTensor.dispose();
    const recommendations = recommendationCandidates.map((product, index) => ({
        ...product,
        score: scores[index]
            + (purchasedCategories.has(product.category) ? 0.05 : 0)
            + (purchasedBrands.has(product.brand) ? 0.05 : 0)
    })).sort((first, second) => second.score - first.score);
    postMessage({ type: workerEvents.recommend, user, recommendations });
}

self.onmessage = event => {
    const { action, dataset, user } = event.data;
    if (action === workerEvents.trainModel) {
        trainModel(dataset).catch(error => {
            console.error('Recommendation model training failed:', error);
            postMessage({ type: workerEvents.trainingComplete, error: error.message });
        });
    }
    if (action === workerEvents.recommend) recommend(user);
};
