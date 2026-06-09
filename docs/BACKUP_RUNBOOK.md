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

### Optie A — Consistente kopie terwijl de app draait (aanbevolen)

Gebruik SQLite's eigen online-backup (`VACUUM INTO`), die een consistente snapshot schrijft zonder de WAL los te hoeven kopiëren:

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

### Optie B — Bestandskopie bij stilstaande app

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
   - Vanuit een `VACUUM INTO`-snapshot (Optie A): kopieer de snapshot naar `./data/nova-studio.db` en **verwijder** een eventueel achtergebleven `nova-studio.db-wal` en `nova-studio.db-shm` (de schone snapshot heeft die niet nodig).
   - Vanuit een bestandskopie (Optie B): zet alle drie de bestanden (`.db`, `-wal`, `-shm`) terug.
3. Herstel de uploads: `tar xzf ./backups/uploads-YYYY-MM-DD.tgz` (uitpakken naar `./server/uploads`).
4. Start de app: `docker compose start app`. Migraties draaien idempotent bij de start; de bestaande data blijft intact.
5. Controleer: `curl -s http://127.0.0.1:4100/api/health` (of de tailnet-URL) en open een project.

> Exports zijn regenereerbaar: open een voorstel en exporteer opnieuw naar PDF om `./data/exports/` te herstellen.

## Aanbevolen routine (cron)

Dagelijkse snapshot om 03:00, met 14 dagen retentie:

```cron
# crontab -e  (op de host)
0 3 * * * cd /home/peter/nova-studio && docker compose exec -T app node -e "const D=require('better-sqlite3');const d=new D('/app/data/nova-studio.db',{readonly:true});d.exec(\"VACUUM INTO '/app/data/backup-\"+new Date().toISOString().slice(0,10)+\".db'\");d.close();" && docker compose cp app:/app/data/backup-$(date +\%F).db ./backups/ && tar czf ./backups/uploads-$(date +\%F).tgz ./server/uploads
# Opruimen: verwijder back-ups ouder dan 14 dagen
30 3 * * * find /home/peter/nova-studio/backups -name 'backup-*.db' -mtime +14 -delete; find /home/peter/nova-studio/backups -name 'uploads-*.tgz' -mtime +14 -delete
```

Test minimaal eens per kwartaal een **volledige restore** in een wegwerp-omgeving — een back-up die nooit hersteld is, is geen back-up.
