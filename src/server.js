require("dotenv").config();
const app = require("./app");
const { seedUsers, ensureActiveColumn, ensureLoginFailuresTable } = require("./controllers/auth.controller");
const { ensureImageColumn, seedCatalog } = require("./controllers/catalog.controller");

const port = Number(process.env.PORT) || 3000;

seedUsers()
  .then(() => ensureActiveColumn())
  .then(() => ensureLoginFailuresTable())
  .then(() => ensureImageColumn())
  .then(() => seedCatalog())
  .then(() => {
    app.listen(port, () => {
      console.log(`PrintLab escuchando en http://127.0.0.1:${port}`);
    });
  })
  .catch((err) => {
    console.error("No se pudo preparar la base:", err.message);
    process.exit(1);
  });
