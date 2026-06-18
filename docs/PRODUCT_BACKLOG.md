# Nova Studio Product Backlog

Statuswaarden: `Completed`, `Partial`, `Scaffolded`, `Not Started`.

Legenda:
- **Completed** — functioneel en gewired (backend + UI waar relevant).
- **Partial** — backend klaar maar UI minimaal, of UI aanwezig maar backend deels — bruikbaar, niet af.
- **Scaffolded** — structuur/adapter staat, echte externe integratie nog niet (bv. 3D-render, e-mailverzending, live AI zonder key).
- **Not Started** — nog niet gebouwd.

## Leverstatus 2026-06-10

Na de platform-expansie:
- **V1 (Foundation)** — in essentie compleet.
- **V2 (Professional Workflow + Design Intelligence)** — grotendeels gebouwd (proposals met secties/versies/status, presentation-config, suppliers, globale color/material libraries, productprijzen/marge/btw/varianten/CSV, budget, intake-UI, media-metadata, command palette, routing, auditlog, soft-delete, optimistic concurrency).
- **V3 (Knowledge + AI + Future Systems)** — gebouwd als functionele fundamenten met eerlijke scaffolding waar externe integratie nodig is: AI draait live tegen Claude alleen met `ANTHROPIC_API_KEY` (anders een eerlijk lokaal concept), render is een placeholder-provider, e-mailnotificaties worden gequeued maar niet verzonden, en auth/RBAC wordt per route afgedwongen zodra gebruikers bestaan.

De meeste items 56–276 zijn **Completed** of **Partial**. Uitzonderingen die **Not Started** blijven zijn expliciet als zodanig gemarkeerd; het Future Vision-blok (281–300) is volledig **Not Started**.

Addendum (validatie-/foutafhandelingsiteratie, 2026-06-09): de gecentraliseerde validatielaag (`validate.js`) en het gestandaardiseerde API-foutformaat `{ error, details? }` zijn geland — items 196 en 197 zijn nu **Completed**.

Addendum (RBAC/ownership, 2026-06-10): `authorization.routeGate` enforceert 401/403-paden, owner/admin-writebeleid en project-/client-ownershipscope zodra gebruikers bestaan. Projecten en klanten krijgen `studio_id`/`owner_id` bij aanmaak; project- en clientlijsten filteren op de zichtbare scope.

## V1

1. [Completed] Projectlijst met statusfilters.
2. [Completed] Project aanmaken met bestaande klant.
3. [Completed] Project aanmaken met nieuwe klant.
4. [Completed] Projectdetail laden met gehydrateerde child-data.
5. [Completed] Projectmetadata bewerken.
6. [Completed] Project hero-afbeelding uploaden.
7. [Completed] Project archiveren.
8. [Completed] Project herstellen uit archief.
9. [Completed] Project dupliceren met intake en rooms.
10. [Completed] Sample project endpoint toevoegen.
11. [Completed] Klantenlijst tonen.
12. [Completed] Klant aanmaken.
13. [Completed] Klant bewerken.
14. [Completed] Klantdetail laden.
15. [Completed] Client contacts API bouwen.
16. [Completed] Client addresses API bouwen.
17. [Completed] Intake-schema opslaan.
18. [Completed] Intake upsert endpoint bouwen.
19. [Completed] Ruimtes aanmaken.
20. [Completed] Ruimtes bewerken.
21. [Completed] Ruimtes verwijderen met referentie-cleanup.
22. [Completed] Ruimte-afbeelding uploaden.
23. [Completed] Floorplan upload ondersteunen.
24. [Completed] Eenvoudige floorplan tekening opslaan.
25. [Completed] Floorplan verwijderen.
26. [Completed] Moodboard aanmaken.
27. [Completed] Moodboard asset uploaden.
28. [Completed] Moodboard en assets verwijderen.
29. [Completed] Projectpalet bewerken.
30. [Completed] Projectmaterialen aanmaken.
31. [Completed] Projectmaterialen verwijderen.
32. [Completed] Productbibliotheek tonen.
33. [Completed] Product aanmaken met afbeelding.
34. [Completed] Product bewerken.
35. [Completed] Product verwijderen met selectie-cleanup.
36. [Completed] Product selecteren voor project.
37. [Completed] Projectproduct bewerken.
38. [Completed] Shoppinglijst per project tonen.
39. [Completed] Budgettotaal berekenen.
40. [Completed] Proposal record aanmaken.
41. [Completed] Proposal frontend document tonen.
42. [Completed] Browser print voor proposal.
43. [Completed] PDF-export via PDFKit.
44. [Completed] Fullscreen presentatie tonen.
45. [Completed] Presentatienavigatie met toetsenbord.
46. [Completed] Stijlgids scherm toevoegen.
47. [Completed] Tweaks-paneel met localStorage.
48. [Completed] Dockerfile voor productie.
49. [Completed] Docker Compose met Tailscale sidecar.
50. [Completed] Healthcheck endpoint.
51. [Completed] Upload static serving.
52. [Completed] Export static serving.
53. [Completed] SQLite WAL en foreign keys inschakelen.
54. [Completed] Idempotente schema-migraties.
55. [Completed] Utility-tests voor id, JSON parsing en upload URL.
56. [Completed] Documentatiefundering in `/docs`.
57. [Completed] Proposal PUT endpoint.
58. [Completed] Proposal DELETE endpoint.
59. [Completed] Proposal versieveld toevoegen.
60. [Completed] Proposal statusveld toevoegen.
61. [Completed] Intake projecttab bouwen.
62. [Completed] Intake UI voor alle bestaande velden.
63. [Completed] Intake vrije notities zichtbaar maken in projectflow.
64. [Completed] Proposal PDF fallbackteksten vervangen door workflow-waarschuwingen.
65. [Completed] Proposal PDF styling afstemmen op design system.
66. [Completed] Proposal export bestandsnaam klantvriendelijk maken.
67. [Completed] Proposal exportgeschiedenis tonen.
68. [Completed] API-test voor project aanmaken.
69. [Completed] API-test voor klant aanmaken.
70. [Completed] API-test voor productselectie.
71. [Completed] API-test voor proposal export.
72. [Partial] API-test voor upload URL veiligheid. (uploadUrl-util getest, geen dedicated route-securitytest)
73. [Not Started] Frontend smoke-test voor project-to-proposal flow.
74. [Not Started] Frontend smoke-test voor presentatie openen.
75. [Completed] Build-check toevoegen aan releaseproces. (`npm run build`)
76. [Completed] Documentatie-update checklist toevoegen aan README.
77. [Completed] Schema changelog toevoegen. (`docs/SCHEMA_CHANGELOG.md`)
78. [Completed] Database backup runbook toevoegen. (`docs/BACKUP_RUNBOOK.md` + ingebouwd mechanisme: `backup.js`, `npm run backup`, `/api/backup`, UI)
79. [Completed] Upload cleanup audit toevoegen. (media-orphans + cleanup)
80. [Partial] Error states per domeinscherm verbeteren.
81. [Partial] Empty states per domeinscherm concreter maken.
82. [Completed] Projectduplicatie uitbreiden met materials.
83. [Completed] Projectduplicatie uitbreiden met moodboards.
84. [Completed] Projectduplicatie uitbreiden met productselecties.
85. [Partial] Projecttemplates zichtbaar beheren. (vlag + filter aanwezig; geen dedicated templatebeheer-UI)
86. [Completed] Templatefilter in UI activeren.
87. [Partial] Project statusmodel documenteren in app.
88. [Completed] Client contacts UI bouwen.
89. [Completed] Client addresses UI bouwen.
90. [Completed] Klantnotities zichtbaar maken bij project.
91. [Partial] Globale zoekresultaten per type groeperen. (command palette groepeert views/tabs/projecten)
92. [Partial] Productcategorieën beheerbaar maken. (vrije categorie + filter; geen beheerd vocabularium)
93. [Completed] Shoppinglijst selectie persistent maken.
94. [Completed] Shoppinglijst export naar CSV.
95. [Completed] Materialen bewerken vanuit UI.
96. [Completed] Materialen sorteren vanuit UI.
97. [Completed] Room sortering beheerbaar maken.
98. [Completed] Floorplan bewerken na aanmaak.
99. [Partial] Floorplan image/PDF preview verbeteren. (thumbnail-veld + weergave; geen server-side PDF-thumb-generatie)
100. [Completed] Moodboard bewerken na aanmaak.

## V2

101. [Completed] Proposal sectiemodel ontwerpen.
102. [Completed] Proposal secties als tabel toevoegen.
103. [Completed] Proposal sectievolgorde beheerbaar maken.
104. [Completed] Proposal sectie aan/uit toggles.
105. [Partial] Proposal prijsbijlage genereren. (appendices in PDF wanneer data bestaat)
106. [Partial] Proposal materiaalstaat genereren. (via appendices)
107. [Partial] Proposal productbijlage genereren. (via appendices/shoppingsectie)
108. [Completed] Proposal klantversie en interne versie scheiden. (audience client/internal)
109. [Completed] Proposal acceptatieknop voorbereiden. (statusflow zet accepted_at)
110. [Completed] Proposal opmerkingen per sectie opslaan.
111. [Completed] Presentation pagina's configureerbaar maken.
112. [Completed] Presentation presenter notes toevoegen.
113. [Completed] Presentation klantmodus zonder edit chrome.
114. [Partial] Presentation export naar PDF onderzoeken. (proposal-PDF dekt dit; geen aparte slide-export)
115. [Completed] Presentation volgorde per project opslaan.
116. [Partial] Moodboard layout-editor bouwen. (layout_json + variant-UI; geen drag-canvas)
117. [Completed] Moodboard asset captions bewerken.
118. [Completed] Moodboard asset bronvermelding opslaan.
119. [Completed] Moodboard asset tags toevoegen.
120. [Completed] Moodboard varianten per project.
121. [Completed] Moodboard klantfeedback registreren.
122. [Completed] Moodboard promoted concepts naar Design Library.
123. [Completed] Floorplan schaal instellen.
124. [Completed] Floorplan maatlijnen opslaan. (dedicated maatlijntool met labels in `drawing_json.dimensions`)
125. [Partial] Floorplan objectenbibliotheek. (objecten per plattegrond; geen herbruikbare bibliotheek)
126. [Completed] Floorplan laagmodel voor muren, meubels en annotaties.
127. [Completed] Floorplan versiebeheer.
128. [Partial] Floorplan annotaties per ruimte. (annotatie-laag; geen room-scoping per annotatie)
129. [Partial] Floorplan PDF upload thumbnail. (thumb_path-veld; geen server-side generatie)
130. [Not Started] Floorplan image crop/fit controls.
131. [Completed] Product inkoopprijs toevoegen.
132. [Completed] Product verkoopprijs en marge toevoegen.
133. [Completed] Product btw-percentage toevoegen.
134. [Completed] Product beschikbaarheidsstatus toevoegen.
135. [Completed] Product prijsdatum toevoegen.
136. [Completed] Product varianten modelleren.
137. [Completed] Product alternatieven vergelijken in UI. (`/compare`)
138. [Completed] Product favorieten toevoegen.
139. [Completed] Product import via CSV.
140. [Completed] Product export via CSV.
141. [Completed] Supplier tabel toevoegen.
142. [Completed] Supplier contactpersonen toevoegen.
143. [Completed] Supplier condities vastleggen.
144. [Completed] Supplier levertijdhistorie vastleggen.
145. [Completed] Supplier betrouwbaarheidsnotities toevoegen.
146. [Completed] Products koppelen aan supplier_id.
147. [Completed] Materials koppelen aan supplier_id.
148. [Completed] Globale Color Library tabel toevoegen.
149. [Completed] Color Library UI bouwen.
150. [Completed] Projectpalet koppelen aan globale kleuren.
151. [Completed] Kleurtoepassingen per ruimte opslaan.
152. [Completed] Kleurmerken en codes opslaan.
153. [Completed] Globale Material Library tabel toevoegen.
154. [Completed] Material Library UI bouwen.
155. [Completed] Projectmaterialen koppelen aan globale materialen.
156. [Completed] Materiaal onderhoudsinformatie opslaan.
157. [Completed] Materiaal duurzaamheidsscore opslaan.
158. [Completed] Materiaal monsterstatus opslaan.
159. [Completed] Design Library concepten toevoegen.
160. [Partial] Design Library room templates toevoegen. (kind ondersteund; geen dedicated room-template-flow)
161. [Partial] Design Library productsets toevoegen. (via data_json/kind)
162. [Partial] Design Library materiaalsets toevoegen. (via data_json/kind)
163. [Partial] Design Library proposal snippets toevoegen. (via kind; geen directe invoeg-in-voorstel)
164. [Not Started] Intake vragenlijst configureren.
165. [Completed] Intake scope-inschatting toevoegen.
166. [Completed] Intake risico's handmatig markeren.
167. [Completed] Intake vervolgvragen opslaan.
168. [Completed] Intake klantportaal-ready schema ontwerpen.
169. [Completed] Budgetlijnen per project professionaliseren.
170. [Completed] Budget scenario's toevoegen.
171. [Completed] Kamerbudgetten toevoegen.
172. [Completed] Budget marge-overzicht toevoegen.
173. [Completed] Shoppinglijst per ruimte exporteren. (CSV per project, met ruimte)
174. [Completed] Shoppinglijst goedkeuringsstatus per item.
175. [Completed] Productitem status: voorgesteld, akkoord, afgewezen.
176. [Completed] Productitem klantopmerking opslaan.
177. [Completed] Productitem intern alternatief markeren.
178. [Completed] Media metadata tabel toevoegen.
179. [Completed] Media alt-tekst opslaan.
180. [Completed] Media tags opslaan.
181. [Completed] Media hergebruik tussen domeinen. (domain/ref_id)
182. [Completed] Uploads orphan cleanup taak.
183. [Completed] App URL routing toevoegen. (hash-routing)
184. [Completed] Deep links naar projecttabs.
185. [Completed] Command palette ontwerpen.
186. [Completed] Auditlog tabel toevoegen.
187. [Completed] Change history per project. (audit gefilterd op entity_id)
188. [Completed] Soft delete strategie bepalen. (projects deleted_at + undelete)
189. [Not Started] Import/export volledige projectbundel.
190. [Completed] Back-up hersteltest documenteren. (`docs/BACKUP_RUNBOOK.md`)
191. [Not Started] Accessibility audit uitvoeren.
192. [Partial] Mobile responsive polish.
193. [Not Started] Desktop screenshot regressietest.
194. [Partial] Print CSS uitbreiden.
195. [Not Started] PDF visual regression smoke-test.
196. [Completed] Form validatie uniformeren met zod. (gecentraliseerd in `validate.js`, `validateBody`/`validateForm` op vrijwel alle write-endpoints; projects/auth via eigen inline zod met hetzelfde foutcontract)
197. [Completed] API error format standaardiseren. (één envelope `{ error, details? }`, globale handler mapt ZodError→400/multer→413/`err.status`)
198. [Not Started] API pagination voorbereiden.
199. [Partial] API filtering standaardiseren. (query-filters per module; geen gedeelde laag)
200. [Not Started] API service layer introduceren waar domeinlogica groeit.

## V3

201. [Completed] Studio users tabel toevoegen.
202. [Completed] Studios/organisaties tabel toevoegen.
203. [Completed] Memberships en rollen toevoegen.
204. [Completed] Auth provider kiezen voor self-hosted. (Node-crypto scrypt, lokaal)
205. [Completed] Login UI bouwen.
206. [Completed] Session middleware toevoegen. (optioneel, niet-blokkerend)
207. [Completed] Ownership op hoofdtabellen toevoegen. (projecten en klanten hebben `studio_id`/`owner_id`; routes filteren/valideren ownership zodra gebruikers bestaan)
208. [Completed] Role based access control implementeren. (`auth.apiGate` + `authorization.routeGate`: 401 zonder sessie, 403 voor member-writes, owner/admin-writebeleid, audit-log bij forbidden)
209. [Completed] Multi-user auditlog tonen. (auditlog + API + Activiteit-scherm; mutaties toegeschreven aan acteur via AsyncLocalStorage)
210. [Completed] Optimistic concurrency voor projectbewerkingen. (row_version, 409 bij conflict)
211. [Completed] Klantportaal datamodel ontwerpen.
212. [Completed] Magic-link toegang voor klanten.
213. [Completed] Read-only proposal portal.
214. [Completed] Klantfeedback per proposal sectie.
215. [Completed] Klantgoedkeuring per productitem. (schrijft selectie-status terug)
216. [Partial] Klantgoedkeuring per voorstelversie. (proposal-feedback aanwezig; geen formele versie-akkoordknop in portal)
217. [Completed] Portal media access beveiligen. (token-bundel lekt geen interne velden)
218. [Completed] Portal activiteit loggen.
219. [Completed] Email notificaties voor portal. (in-app notificatiecentrum — bel + paneel + `/api/notifications`; portaalreacties via `notify()`; optionele SMTP-verzending via pluggable `mailer.js` wanneer `NOVA_SMTP_URL` + `nodemailer` aanwezig)
220. [Completed] Project timeline en mijlpalen toevoegen.
221. [Completed] Taken per project toevoegen.
222. [Completed] Taken per ruimte toevoegen.
223. [Completed] Taken koppelen aan voorstelstatus.
224. [Completed] Planning view bouwen.
225. [Completed] Contractdocumenten opslaan. (project_documents)
226. [Partial] Factuurvoorbereiding modelleren. (budget marge/btw-overzicht; geen factuurentiteit)
227. [Not Started] Offerte-aanvraag naar leverancier voorbereiden.
228. [Not Started] Supplier price list import.
229. [Not Started] Supplier catalog sync adapter.
230. [Not Started] Supplier email templates.
231. [Partial] Product availability snapshots. (availability_status-veld; geen snapshot-historie)
232. [Partial] Product price history. (price_date-veld; geen historie-tabel)
233. [Not Started] Product duplicate detection.
234. [Not Started] Product enrichment queue.
235. [Partial] Material sample ordering workflow. (sample_status-veld; geen bestelflow)
236. [Completed] Material sample status dashboard. (cross-project sample-overview endpoint + tab in Materiaalbibliotheek met deep links naar projectmateriaaltab)
237. [Completed] Color palette comparison tool. (Color Library + per-room toepassingen)
238. [Partial] Room specification sheet. (roomvelden + appendices; geen aparte spec-sheet-export)
239. [Not Started] Room finish schedule.
240. [Partial] Installation notes per room. (designer_notes; geen aparte installatie-sectie)
241. [Completed] Project handover package. (gebundelde handover-PDF met ruimtes, materialen, geselecteerde producten en projectdocumenten-index)
242. [Completed] Knowledge nodes tabel.
243. [Completed] Knowledge edges tabel.
244. [Completed] Knowledge source references.
245. [Completed] Knowledge promotion vanuit project.
246. [Completed] Knowledge promotion vanuit proposal.
247. [Completed] Knowledge promotion vanuit product.
248. [Completed] Knowledge promotion vanuit moodboard.
249. [Completed] Knowledge search UI.
250. [Completed] Knowledge relation path viewer.
251. [Completed] AI provider adapter interface.
252. [Completed] AI settings UI.
253. [Completed] Prompt templates tabel.
254. [Completed] Prompt versiebeheer.
255. [Completed] AI jobs tabel.
256. [Completed] AI output reviewstatus.
257. [Partial] Intake Analyse eerste providerflow. (flow + context; live alleen met ANTHROPIC_API_KEY, anders lokaal concept)
258. [Partial] Proposal Writing eerste providerflow. (idem; incl. checklist + score)
259. [Partial] Product Research eerste providerflow. (idem; geen externe research-bronnen)
260. [Partial] Moodboard Analysis eerste providerflow. (idem; tekstanalyse, geen beeldanalyse)
261. [Partial] Knowledge Retrieval eerste providerflow. (idem; over knowledge-nodes)
262. [Completed] AI bronverwijzingen in UI. (sources per job)
263. [Partial] AI privacyconfiguratie per project. (privacy_mode globaal in settings; niet per project)
264. [Completed] AI usage logging. (jobs + audit)
265. [Completed] AI cost tracking. (token-/kostenschatting per job)
266. [Partial] AI output diff review. (review-status approve/reject; geen diff-weergave)
267. [Partial] AI regenerate per sectie. (`/jobs/:id/regenerate` per job; geen sectie-granulariteit)
268. [Not Started] AI tone-of-voice presets.
269. [Completed] AI missing-content checklist. (in proposal_writing)
270. [Completed] AI proposal quality score. (in proposal_writing)
271. [Completed] Floorplan geometry normaliseren. (geometry_json per object)
272. [Completed] Floorplan object placement schema. (floorplan_objects op lagen)
273. [Completed] Material/product placement koppeling. (`floorplan_objects.product_id` / `material_id` met ON DELETE SET NULL, picker in object-editor)
274. [Completed] Render job tabel.
275. [Completed] Render output storage. (output_path in uploads)
276. [Scaffolded] Render provider adapter. (pluggable adapter; alleen placeholder-provider die SVG-label schrijft)
277. [Not Started] 3D scene proof of concept.
278. [Not Started] Room render vanuit material/product data.
279. [Not Started] Before/after presentatiepagina.
280. [Not Started] Render feedback opslaan.

## Future Vision

281. [Not Started] Volledig klantportaal met projectdashboard.
282. [Not Started] Realtime samenwerking in projectdossiers.
283. [Not Started] Comment threads op beelden en proposals.
284. [Not Started] Digitale ondertekening voor voorstellen.
285. [Not Started] Betalings- of facturatie-integraties.
286. [Not Started] Leveranciersmarktplaats integratie.
287. [Not Started] Automatische prijs- en voorraadmonitoring.
288. [Not Started] CAD-import pipeline.
289. [Not Started] IFC/BIM metadata verkennen.
290. [Not Started] AR preview voor productplaatsing.
291. [Not Started] Geautomatiseerde materiaalstaten per ruimte.
292. [Not Started] Studio performance analytics.
293. [Not Started] Project profitability analytics.
294. [Not Started] Recommendation engine op basis van eerdere projecten.
295. [Not Started] Cross-project style intelligence.
296. [Not Started] Multi-studio template sharing.
297. [Not Started] Offline-first PWA mode.
298. [Not Started] End-to-end encrypted client data mode.
299. [Not Started] Pluggable AI providers per studio.
300. [Not Started] Nova Studio als volledig zelflerend interieurstudio-OS.
