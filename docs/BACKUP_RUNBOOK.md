# Nova Studio Backup Runbook

Nova Studio is volledig self-hosted en houdt alle data lokaal. Deze runbook beschrijft hoe je consistent back-upt en herstelt.

## Wat moet er mee

- **Database** — `./data/`
  - `nova-studio.db` — de SQLite-database.
  - `nova-studio.db-wal` — write-ahead log (kan ongecommitte writes bevatten).
  - `nova-studio.db-shm` — shared-memory index voor de WAL.
  - Back-up deze drie altijd **samen**; een losse `.db` zonder `-wal` mist recente writes.
- **Uploads** — `./server/uploads/` (hero-beelden, ruimte-/materiaal-/productfoto's, moodboard-assets, render-output, documenten).
- **Niet nodig** — `./data/exports/` bevat gegenereerde PDF's; die zijn **regenereerbaar** uit de database en hoeven niet in de back-up.

Paden zijn configureerbaar via env (`NOVA_DATA_DIR`, `NOVA_DB_PATH`, `NOVA_UPLOAD_DIR`, `NOVA_EXPORT_DIR`); de defaults hierboven gelden voor de standaard Docker-/lokale opzet.

## Back-up maken

### Ingebouwde back-up (aanbevolen)

Nova Studio heeft een ingebouwd back-upmechanisme: een consistente online-snapshot via better-sqlite3's `.backup()` (WAL-safe, blokkeert de app niet). Het schrijft één compleet `.db`-bestand — geen losse `-wal`/`-shm` nodig — naar `./data/backups/` en behoudt automatisch de laatste `NOVA_BACKUP_KEEP` (default 14).

Drie manieren, alle gelijkwaardig:

```bash
# 1. CLI / cron — in de draaiende container
docker compose exec -T app npm run backup
#    of lokaal:  npm run backup

# 2. API (owner/admin wanneer auth aan staat; open in single-user modus)
curl -X POST http://127.0.0.1:4100/api/backup           # maak snapshot in ./data/backups/
curl -s   http://127.0.0.1:4100/api/backup              # lijst back-ups
curl -OJ  http://127.0.0.1:4100/api/backup/download     # verse snapshot direct downloaden
```

3. **UI** — *Instellingen → Back-up*: "Maak back-up nu", "Download verse back-up", en een lijst van bestaande back-ups met download/verwijder-knoppen.

Back-ups landen in `./data/backups/` (binnen de gemounte `./data`-volume, dus een host-kopie van `./data` bevat ze automatisch). Neem `./server/uploads/` apart mee — die zitten niet in de DB:

```bash
tar czf ./backups/uploads-$(date +%F).tgz ./server/uploads
```

### Fallback A — Handmatige consistente kopie (`VACUUM INTO`)

Zonder de app-API, met SQLite's eigen online-backup:

```bash
# Vanuit de draaiende container — schrijft één compacte, consistente .db
docker compose exec app node -e "const Database=require('better-sqlite3'); const db=new Database('/app/data/nova-studio.db',{readonly:true}); db.exec(\"VACUUM INTO '/app/data/backup-\"+new Date().toISOString().slice(0,10)+\".db'\"); db.close();"

# Haal de snapshot uit de container naar de host
docker compose cp app:/app/data/backup-$(date +%F).db ./backups/
```

De resulterende `backup-YYYY-MM-DD.db` is één bestand zonder bijbehorende `-wal`/`-shm` en is direct herstelbaar. Neem daarnaast `./server/uploads/` mee:

```bash
tar czf ./backups/uploads-$(date +%F).tgz ./server/uploads
```

### Fallback B — Bestandskopie bij stilstaande app

Wanneer de container gestopt is, is een directe bestandskopie veilig:

```bash
docker compose stop app
cp -a ./data/nova-studio.db ./data/nova-studio.db-wal ./data/nova-studio.db-shm ./backups/
tar czf ./backups/uploads-$(date +%F).tgz ./server/uploads
docker compose start app
```

Kopieer bij deze optie **altijd alle drie** de db-bestanden samen.

## Herstellen

1. Stop de app: `docker compose stop app`.
2. Plaats de back-up terug in `./data/`:
   - Vanuit een ingebouwde of `VACUUM INTO`-snapshot (één `.db`, bv. `./data/backups/nova-….db` of een gedownloade `nova-studio-….db`): kopieer die naar `./data/nova-studio.db` en **verwijder** een eventueel achtergebleven `nova-studio.db-wal` en `nova-studio.db-shm` (de schone snapshot heeft die niet nodig).
   - Vanuit een bestandskopie (Fallback B): zet alle drie de bestanden (`.db`, `-wal`, `-shm`) terug.
3. Herstel de uploads: `tar xzf ./backups/uploads-YYYY-MM-DD.tgz` (uitpakken naar `./server/uploads`).
4. Start de app: `docker compose start app`. Migraties draaien idempotent bij de start; de bestaande data blijft intact.
5. Controleer: `curl -s http://127.0.0.1:4100/api/health` (of de tailnet-URL) en open een project.

> Exports zijn regenereerbaar: open een voorstel en exporteer opnieuw naar PDF om `./data/exports/` te herstellen.

## Aanbevolen routine (cron)

Dagelijkse snapshot om 03:00. De DB-retentie regelt de app zelf (`NOVA_BACKUP_KEEP`, default 14); voor uploads ruim je los op:

```cron
# crontab -e  (op de host)
0 3 * * * cd /home/peter/nova-studio && docker compose exec -T app npm run backup && tar czf ./backups/uploads-$(date +\%F).tgz ./server/uploads
# Opruimen: uploads-archieven ouder dan 14 dagen (DB-back-ups worden automatisch gepruned)
30 3 * * * find /home/peter/nova-studio/backups -name 'uploads-*.tgz' -mtime +14 -delete
```

Stel `NOVA_BACKUP_KEEP` in de app-service van `docker-compose.yml` in om de retentie aan te passen.

Test minimaal eens per kwartaal een **volledige restore** in een wegwerp-omgeving — een back-up die nooit hersteld is, is geen back-up.
