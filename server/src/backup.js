// Standalone backup runner — `npm run backup` or via cron.
// Creates a consistent online snapshot of the SQLite DB and prunes old ones.
const { createBackup, backupDir } = require("./modules/backup");

createBackup()
  .then((info) => {
    console.log(`Back-up gemaakt: ${info.filename} (${info.size} bytes) in ${backupDir}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Back-up mislukt:", err.message);
    process.exit(1);
  });
