const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const app = require("./app");
const { seedUsers, ensureActiveColumn, ensureLoginFailuresTable } = require("./controllers/auth.controller");
const { ensureImageColumn, seedCatalog } = require("./controllers/catalog.controller");
const { ensureRequestsSchema } = require("./controllers/requests.controller");

const port = Number(process.env.PORT) || 3000;

async function initDatabase(retries = 6, delayMs = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await seedUsers();
      await ensureActiveColumn();
      await ensureLoginFailuresTable();
      await ensureImageColumn();
      await ensureRequestsSchema();
      await seedCatalog();
      return;
    } catch (err) {
      if (attempt === retries) throw err;
      console.log(`MariaDB aún no está lista (${err.message}). Reintentando conexión (${attempt}/${retries})...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

initDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`PrintLab escuchando en http://127.0.0.1:${port}`);
    });
  })
  .catch((err) => {
    console.error("No se pudo preparar la base:", err.message);
    process.exit(1);
  });
