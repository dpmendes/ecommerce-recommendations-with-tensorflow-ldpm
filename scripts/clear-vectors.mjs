import { ChromaClient } from 'chromadb';

const client = new ChromaClient();

const collections = ['ecommerce_product_vectors', 'ecommerce_user_vectors'];

for (const name of collections) {
  try {
    await client.deleteCollection({ name });
    console.log(`Deleted Chroma collection: ${name}`);
  } catch (error) {
    console.warn(`Unable to delete Chroma collection: ${name}`, error.message || error);
  }
}

console.log('Vector cleanup complete. Run npm run vectorize to rebuild the collections.');
