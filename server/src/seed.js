// CLI: `npm run seed` — loads the Herenhuis aan de Keizersgracht sample project.
const { migrate } = require("./db/schema");
const { seedSampleProject } = require("./modules/seed");

migrate();
const projectId = seedSampleProject();
console.log(`Sample project klaar: ${projectId}`);
process.exit(0);
