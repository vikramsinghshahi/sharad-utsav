import { testDatabaseUrl } from "./test-database";

// Anything that reads DATABASE_URL (the app's own DB client) uses the test DB.
process.env.DATABASE_URL = testDatabaseUrl();
