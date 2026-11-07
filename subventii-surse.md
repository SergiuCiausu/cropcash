# Monitor subvenții agricole România – specificație și surse

Document de pornire pentru Claude Code. Scopul: un script care rulează zilnic (cron), descarcă paginile și documentele de mai jos, și **semnalează doar ce s-a schimbat**: subvenții noi, ghiduri noi, condiții modificate, sesiuni deschise/închise.

Listă compilată la 7 noiembrie 2026.

---

## 1. Ce trebuie să facă scriptul

1. **Descărcare inițială**: pentru fiecare URL din secțiunea 4, descarcă pagina/PDF-ul, extrage textul, salvează-l împreună cu metadatele (dată, hash, ETag, Last-Modified).
2. **Rulare zilnică**: verifică fiecare sursă și descarcă din nou doar ce s-a schimbat (vezi secțiunea 2).
3. **Descoperire**: pe paginile marcate `index` (pagini care listează alte documente), extrage toate linkurile către PDF/DOC/pagini noi și adaugă-le automat în monitorizare dacă nu au mai fost văzute.
4. **Raport**: la final, produce un raport zilnic (Markdown) cu: surse noi, surse modificate (cu diff de text), surse care au dispărut (404), erori. Dacă nu s-a schimbat nimic, raportul spune doar asta.
5. Opțional: notificare (e-mail / Telegram / Slack) doar când raportul are modificări.

---

## 2. Cum se evită descărcările inutile (detectarea modificărilor)

Folosește verificări în cascadă, de la cea mai ieftină la cea mai scumpă:

1. **Cereri HTTP condiționate.** Salvează `ETag` și `Last-Modified` din răspuns. La rularea următoare trimite `If-None-Match` / `If-Modified-Since`. Un răspuns `304 Not Modified` înseamnă „nimic nou”, fără să descarci conținutul.
2. **HEAD pentru PDF-uri.** Pentru documente, compară `Content-Length` și `Last-Modified` din HEAD înainte de GET.
3. **Hash pe conținutul util, nu pe toată pagina.** Multe site-uri guvernamentale nu trimit ETag corect sau schimbă la fiecare încărcare elemente irelevante (dată curentă, contor vizitatori, bannere, token-uri CSRF). Extrage doar zona principală de conținut (de ex. cu `trafilatura` sau selectori CSS per site), normalizează textul (spații, majuscule nu), apoi calculează SHA-256. Hash diferit = modificare reală.
4. **Diff de text.** Când hash-ul diferă, salvează noua versiune și generează un diff (`difflib`) față de cea precedentă. Diff-ul intră în raport.
5. **Link-uri noi pe paginile index.** Pe paginile `index`, compară setul de linkuri extrase cu cel de ieri. Linkurile noi (mai ales PDF-uri cu „ghid”, „anexa”, „ordin”, „sesiune”, „2026”/„2027” în nume) sunt cel mai bun semnal pentru o subvenție nouă sau o versiune nouă de ghid.
6. **PDF-uri versionate prin nume.** Instituțiile publică adesea o versiune nouă cu alt nume de fișier (ex. `...-v2.pdf`, `...rectificat-18.06.2025.pdf`). Pasul 5 le prinde; scriptul poate grupa fișierele similare ca „versiuni ale aceluiași document”.
7. **Frecvență diferențiată (opțional).** Paginile de sesiuni (AFIR) și de campanie (APIA) zilnic; legislația, registrele și paginile UE săptămânal.

**Stocare propusă:** SQLite cu tabele `sources` (url, institutie, titlu, tip, frecventa), `snapshots` (url, data, http_status, etag, last_modified, content_hash, text_path), `links_seen` (pagina_index, url_link, prima_data_vazut). Textul extras se salvează pe disc, organizat pe dată.

---

## 3. Reguli de bun-simț și limitări cunoscute

- **robots.txt:** în timpul cercetării, `madr.ro`, `apia.org.ro`, `mfe.gov.ro`, `ansvsa.ro` și `rrn-pac.eu` au blocat accesul automat prin robots.txt. Scriptul trebuie să citească și să respecte robots.txt pentru fiecare domeniu și să raporteze sursele blocate, nu să le ocolească. Pentru acestea, alternative legitime: fluxuri RSS dacă există, verificarea manuală, sau o cerere de acces/date deschise către instituție (data.gov.ro).
- **Politețe:** maximum o cerere la câteva secunde per domeniu, User-Agent descriptiv cu un contact, retry cu backoff, timeout.
- **Conținut dinamic:** unele pagini (ex. portalul AFIR de depunere, MySMIS) cer JavaScript sau CAPTCHA. Se monitorizează doar pagina publică, nu se încearcă ocolirea CAPTCHA.
- **Linkuri instabile:** linkurile marcate `neverificat` nu au putut fi deschise la compilare; prima rulare trebuie să raporteze care răspund 404 sau redirecționează.
- **Encoding:** site-urile pot amesteca ș/ş și ț/ţ (cu sedilă vs. virgulă); normalizează înainte de hash și căutare.

---

## 4. Surse

Coloane: **Tip** = `index` (pagină care listează documente; monitorizează linkurile noi), `pagina` (conținut de urmărit), `pdf` (document); **Verificat** = dacă linkul a putut fi deschis la compilare.

### 4.1 MADR – Ministerul Agriculturii și Dezvoltării Rurale

| Titlu | URL | Tip | Verificat |
| --- | --- | --- | --- |
| PS PAC 2023-2027 – pagina de implementare | https://www.madr.ro/planul-national-strategic-pac-post-2020/implementare-ps-pac-2023-2027/ps-pac-2023-2027.html | index | da |
| PS PAC 2023-2027 v1.2 (21.11.2022) | https://www.madr.ro/docs/dezvoltare-rurala/2022/PNS_2023-2027-versiunea_1.2-21.11.2022.pdf | pdf | da |
| Documente implementare PNS | https://www.madr.ro/planul-national-strategic-pac-post-2020/documente-implementare-pns.html | index | nu |
| Documente de programare PS PAC | https://www.madr.ro/planul-national-strategic-pac-post-2020/programare-ps-pac-2023-2027/documente-de-programare.html | index | nu |
| Implementare PS PAC 2023-2027 | https://www.madr.ro/planul-national-strategic-pac-post-2020/implementare-ps-pac-2023-2027.html | index | nu |
| Calendar estimativ lansări intervenții DR (04.11.2025) | https://www.madr.ro/docs/dezvoltare-rurala/2025/PS-PAC-2023-2027/calendar-estimativ-lansare-interventii-DR_PS-PAC-04.11.2025.pdf | pdf | nu |
| Situația proiectelor depuse PS PAC | https://www.madr.ro/planul-national-strategic-pac-post-2020/implementare-ps-pac-2023-2027/situatia-proiectelor-depuse-ps-pac-2023-2027.html | pagina | nu |
| Ghiduri și broșuri PS PAC | https://www.madr.ro/planul-national-strategic-pac-post-2020/implementare-ps-pac-2023-2027/evaluare-ps-pac/ghiduri-si-brosuri-ps-pac.html?layout=blog | index | nu |
| Ajutor de stat | https://madr.ro/ajutor-de-stat.html | index | nu |
| Măsuri de sprijin MADR pentru fermieri | https://www.madr.ro/docs/minister/masuri-de-sprijin-MADR--pentru-fermieri.pdf | pdf | nu |
| Schema de minimis legumicultori 2025-2027 (știre) | https://www.madr.ro/comunicare/9638-sprijin-pentru-legumicultori-a-fost-aprobata-schema-de-ajutor-de-minimis-pentru-perioada-2025-2027.html | pagina | nu |
| Legislație națională – dezvoltare rurală | https://www.madr.ro/legislatie-dezvoltare-rurala/legislatie-nationala.html | index | nu |
| Proiecte de acte normative | https://www.madr.ro/proiecte-de-acte-normative.html | index | nu |
| Dezvoltare rurală (Autoritatea de Management) | https://www.madr.ro/dezvoltare-rurala.html | index | nu |
| Ghid eco-scheme vegetal 2026 | https://www.madr.ro/docs/dezvoltare-rurala/agro-mediu/2026/Ghid-informativ-privind-aplicarea-eco-schemelor-din-sectorul-vegetal-Campania-2026.pdf | pdf | nu |
| Ghid eco-scheme zootehnic 2026 | https://www.madr.ro/docs/dezvoltare-rurala/agro-mediu/2026/Ghid-informativ-ecoscheme-zootehnic-C2026-edV.pdf | pdf | nu |
| Lista DAJ cu contacte | https://www.madr.ro/docs/contact/directii-agricole-judetene-DAJ.pdf | pdf | nu |

### 4.2 APIA – Agenția de Plăți și Intervenție pentru Agricultură

| Titlu | URL | Tip | Verificat |
| --- | --- | --- | --- |
| Depune online Cererea Unică de Plată | https://apia.org.ro/depune-online-cererea-unica-de-plata/ | pagina | nu |
| AGI Online (depunere) | https://agi.apia.org.ro/ | pagina | nu |
| Materiale de informare 2026 | https://apia.org.ro/materiale-de-informare/materiale-de-informare-anul-2026/ | index | nu |
| Instrucțiuni completare cerere 2026 | https://apia.org.ro/wp-content/uploads/2026/03/Anexa-2.pdf | pdf | nu |
| Intervenții implementate din PNS | https://apia.org.ro/planul-national-strategic-2023-2027-pns-al-romaniei/interventii-implementate-din-pns/ | index | nu |
| Sprijin complementar tineri fermieri (CIS-YF) | https://apia.org.ro/planul-national-strategic-2023-2027-pns-al-romaniei/interventii-implementate-din-pns/sprijinul-complementar-pentru-venit-pentru-tinerii-fermieri-cis-yf/ | pagina | nu |
| Ghid informativ DR-04/DR-05 2026 | https://apia.org.ro/wp-content/uploads/2026/03/Ghid-Informativ-DR-04-DR-05.pdf | pdf | nu |
| Ghid informativ LPIS 2026 | https://apia.org.ro/wp-content/uploads/2026/02/Ghid-Informativ-LPIS-editia-I-revizia-1_2026.pdf | pdf | nu |
| Măsuri finanțate de la bugetul național | https://apia.org.ro/ajutoare-specifice/masuri-de-sprijin-finantate-de-la-bugetul-national/ | index | nu |
| Ajutor de stat motorină | https://apia.org.ro/arhiva-masuri-finalizate/ajutor-de-stat-pentru-motorina-utilizata-in-agricultura/ | pagina | nu |
| Comunicat motorină 2026 (depuneri până la 22 decembrie) | https://apia.org.ro/comunicat-de-presa/ajutor-de-stat-pentru-motorina-2026-depuneri-pana-la-22-decembrie/ | pagina | nu |
| Renta viageră agricolă | https://apia.org.ro/ajutoare-specifice/masuri-de-sprijin-finantate-de-la-bugetul-national/renta-viagera-agricola/ | pagina | nu |
| Sector apicol 2026 | https://apia.org.ro/directia-masuri-de-piata/ps-2023-2027-apicol/anul-2026/ | index | nu |
| Legume și fructe | https://apia.org.ro/directia-masuri-de-piata/legume-si-fructe/ | index | nu |
| Investiții vitivinicole ISV-02/ISV-07, 2026 | https://apia.org.ro/directia-masuri-de-piata/ps-pac-2023-2027-isv-02-isv-07-investitii-vitivinicole/sesiune-depunere-2026/ | index | nu |
| Ghid restructurare/reconversie plantații viticole | https://apia.org.ro/wp-content/uploads/2023/06/Ghidul_Solicitantului_sprijinul-financiar-R_R-plantatii-viticole_v4.pdf | pdf | nu |
| Sprijin de urgență și ajutoare de stat | https://apia.org.ro/transparenta/sprijin-de-urgenta-ajutoare-de-stat-alte-forme-de-sprijin-financiar/ | index | nu |
| Notificare forță majoră (secetă) | https://apia.org.ro/comunicat-de-presa/apia-fermierii-afectati-de-seceta-si-alte-fenomene-naturale-trebuie-sa-notifice-situatiile-de-forta-majora-in-termen-de-15-zile-lucratoare/ | pagina | nu |
| Legislație națională | https://apia.org.ro/legislatie/legislatie-nationala1386861017/ | index | nu |
| Formulare | https://apia.org.ro/formulare1386829353/ | index | nu |
| Centre județene | https://apia.org.ro/centre-judetene/ | pagina | nu |
| Sesizează o fraudă | https://apia.org.ro/sesizeaza-un-caz-de-frauda-cu-fonduri-apia/ | pagina | nu |

### 4.3 AFIR – Agenția pentru Finanțarea Investițiilor Rurale

| Titlu | URL | Tip | Verificat |
| --- | --- | --- | --- |
| Exploatații agricole – toate intervențiile | https://www.afir.ro/finantare/finantare-in-agricultura/exploatatii-agricole/ | index | da |
| DR-14 ferme mici – detalii și anexe | https://www.afir.ro/domenii-de-interventie/detalii-si-anexe-dr-14/ | index | da |
| DR-14 – ghidul solicitantului | https://www.afir.ro/api/file/document?url=%2Fmedia%2Fgk1nhmzi%2Fghidul-solicitantului-dr-14.pdf&filename=Ghidul%20Solicitantului%20DR%2014&filetype=pdf | pdf | da |
| DR-30 tineri fermieri – detalii și anexe | https://www.afir.ro/domenii-de-interventie/detalii-si-anexe-dr-30/ | index | da |
| DR-30 – ghidul solicitantului | https://www.afir.ro/api/file/document?url=%2Fmedia%2Ftvmcdzo1%2Fghidul-solicitantului-dr-30.pdf&filename=Ghidul%20Solicitantului%20pentru%20DR%2030&filetype=pdf | pdf | da |
| Pomicultură | https://www.afir.ro/finantare/finantare-in-agricultura/pomicultura/ | index | da |
| DR-15 pomicultură – detalii și anexe | https://www.afir.ro/domenii-de-interventie/detalii-si-anexe-dr-15/ | index | da |
| DR-16 legume și cartofi – detalii și anexe | https://www.afir.ro/domenii-de-interventie/detalii-si-anexe-dr-16/ | index | da |
| DR-17 hamei și struguri de masă – detalii și anexe | https://www.afir.ro/domenii-de-interventie/detalii-si-anexe-dr-17/ | index | da |
| DR-20 zootehnie – detalii și anexe | https://www.afir.ro/domenii-de-interventie/detalii-si-anexe-dr-20/ | index | da |
| Sesiuni deschise | https://www.afir.ro/instrumente/sesiuni/sesiuni-primire-proiecte/ | index | da |
| Arhiva sesiunilor 2023-2027 | https://www.afir.ro/instrumente/sesiuni/arhiva-anunturilor-de-primire-a-proiectelor-aferente-perioadei-2023-2027/ | index | da |
| Reguli de derulare a sesiunilor | https://www.afir.ro/instrumente/sesiuni/detalii-mentiuni-si-informatii-derulare-sesiuni-depunere-proiecte/ | pagina | da |
| Manuale de procedură PS 2027 | https://www.afir.ro/instrumente/instrumente-de-lucru/proceduri-ps-2027/ | index | da |
| Formulare PS 2027 | https://www.afir.ro/instrumente/instrumente-de-lucru/tipizate-si-formulare-ps-2027/ | index | da |
| Portal depunere online (sesiuni, contor fonduri) | https://depunerepspac.afir.ro/Sesiune/Lista | pagina | da |
| Beneficiari FEGA și FEADR | https://www.afir.ro/rapoarte/beneficiari-de-fonduri-europene/beneficiari-fega-si-feadr/ | index | da |
| Lista plăților | https://plati.afir.info/Plati/AfisareListaPlati | pagina | nu |
| Oficii județene (OJFIR) | https://www.afir.ro/despre-afir/oficii-judetene/ | pagina | da |
| Centre regionale (CRFIR) | https://www.afir.ro/despre-afir/centre-regionale/ | pagina | da |

### 4.4 MIPE – Ministerul Investițiilor și Proiectelor Europene (mfe.gov.ro)

| Titlu | URL | Tip | Verificat |
| --- | --- | --- | --- |
| Site MIPE | https://mfe.gov.ro/ | pagina | da |
| Calendar apeluri de finanțare | https://mfe.gov.ro/calendar-apeluri-de-finantare/ | index | nu |
| PNRR | https://mfe.gov.ro/pnrr/ | index | nu |
| PNRR – calendar centralizator apeluri | https://mfe.gov.ro/pnrr-calendarul-centralizator-si-sinteza-apelurilor/ | index | nu |
| Perioada 2021-2027 | https://mfe.gov.ro/minister/perioade-de-programare/perioada-2021-2027/ | index | nu |
| Programe | https://mfe.gov.ro/programe/ | index | nu |
| PDD 2021-2027 | https://mfe.gov.ro/pdd-21-27/ | index | nu |
| PDD – ghiduri | https://mfe.gov.ro/pdds/ghiduri/ | index | nu |
| PEO 2021-2027 | https://mfe.gov.ro/peo-21-27/ | index | nu |
| PEO – calendar lansări | https://mfe.gov.ro/peos/calendar-lansari-apeluri/ | index | nu |
| PIDS 2021-2027 | https://mfe.gov.ro/pids-21-27/ | index | nu |
| PoCIDIF – calendar apeluri | https://mfe.gov.ro/pocidif/calendar-apeluri-de-proiecte-pocidif/ | index | nu |
| MySMIS2021 | https://mysmis2021.gov.ro/ | pagina | da |
| MySMIS2021 – manuale și helpdesk | https://resurse.mysmis2021.gov.ro/ords/repo_bo/r/mysmis-2021/home | pagina | da |

### 4.5 ADR Sud-Muntenia

| Titlu | URL | Tip | Verificat |
| --- | --- | --- | --- |
| Programul Regional Sud-Muntenia 2021-2027 | https://www.adrmuntenia.ro/pr-sm-20212027/static/1295 | index | da |
| Portal PR SM 2021-2027 | https://2021-2027.adrmuntenia.ro | index | da |
| Apeluri de proiecte | https://2021-2027.adrmuntenia.ro/apeluri-de-proiecte | index | da |
| Apel cercetare-inovare IMM (în pregătire) | https://2021-2027.adrmuntenia.ro/prsmidprsm-p1op1--sprijinirea-investitiilor-in-activitati-de-cercetare--inovare-/apel/609 | index | da |
| Apel PRSM/160 microîntreprinderi (închis, model) | https://2021-2027.adrmuntenia.ro/prsmid1113a--intensificarea-cresterii-durabile-si-a-competitivitatii-microintrep/apel/51 | index | da |
| Documente de programare | https://2021-2027.adrmuntenia.ro/docs/23/programare-20212027 | index | da |
| Instrucțiuni | https://2021-2027.adrmuntenia.ro/docs/40/instructiuni | index | da |
| Helpdesk | https://2021-2027.adrmuntenia.ro/helpdesk | pagina | da |
| Apeluri Tranziție Justă (Prahova) | https://www.adrmuntenia.ro/apeluri-ptj/static/1781 | index | da |

### 4.6 FGCR – Fondul de Garantare a Creditului Rural

| Titlu | URL | Tip | Verificat |
| --- | --- | --- | --- |
| Toate produsele | https://fgcr.ro/produse/ | index | da |
| De cinci ori subvenția | https://fgcr.ro/produse/de-cinci-ori-subventia/ | pagina | da |
| De trei ori subvenția | http://fgcr.ro/produse/de-trei-ori-subventia/ | pagina | da |
| Creditul Fermierului | https://fgcr.ro/produse/creditul-fermierului/ | pagina | da |
| Capital de lucru pe baza adeverințelor APIA | http://fgcr.ro/produse/garantii-acordate-pentru-creditele-dedicate-finantarii-capitalului-de-lucru-pe-baza-adeverintelor-emise-de-apia/ | pagina | da |
| Garanții beneficiari PNDR, POPAM, PAC | http://fgcr.ro/produse/garantii-acordate-pentru-creditele-dedicate-finantarii-proiectelor-beneficiarilor-privati-ai-pndr-si-popam | pagina | da |
| Achiziție teren agricol | http://fgcr.ro/produse/garantii-acordate-pentru-creditele-dedicate-achizitiei-de-teren-agricol/ | pagina | da |
| Investiții agricole fără fonduri europene | http://fgcr.ro/produse/garantii-acordate-pentru-creditele-dedicate-finantarii-investitiilor-in-domeniul-agricol-si-al-acvaculturii-fara-finantare-din-pndr/ | pagina | da |
| Garanții de minimis | https://fgcr.ro/produse/garantii-in-cadrul-schemei-ajutor-de-minimis/ | pagina | da |
| AGRO IMM INVEST | http://fgcr.ro/produse/garantii-in-cadrul-subprogramului-agro-imm-invest/ | pagina | da |

### 4.7 FNGCIMM – Fondul Național de Garantare a Creditelor pentru IMM

| Titlu | URL | Tip | Verificat |
| --- | --- | --- | --- |
| Garanții pe baza adeverințelor APIA | https://www.fngcimm.ro/APIA | pagina | da |
| Garanții OUG 43/2013 | https://www.fngcimm.ro/garantii-acordate-in-baza-oug432013 | pagina | da |
| Garanții pentru IMM | https://www.fngcimm.ro/garantii-pentru-imm | pagina | da |
| Instrument financiar PoCIDIF | https://www.fngcimm.ro/po-cidif | pagina | da |
| Refinanțare IMM INVEST PLUS | https://www.fngcimm.ro/refinan%C8%9Bare-imm-invest-plus-%C8%99i-imm-plus | pagina | da |
| Instant IMM | https://www.fngcimm.ro/instant-imm | pagina | da |
| Bănci partenere | https://www.fngcimm.ro/banci-partenere/banci-partenere-garantii-imm | pagina | da |

### 4.8 ANSVSA – Autoritatea Națională Sanitară Veterinară și pentru Siguranța Alimentelor

| Titlu | URL | Tip | Verificat |
| --- | --- | --- | --- |
| Structuri teritoriale (DSVSA județene) | https://www.ansvsa.ro/ansvsa/structuri-teritoriale-d-s-v-s-a/ | pagina | nu |
| Autorizare și înregistrare unități | https://www.ansvsa.ro/industrie-si-afaceri/autorizare-inregistrare-unitati-animal-non-animal/ | index | nu |
| Exploatații apicole | https://www.ansvsa.ro/exploatatii-apicole/ | pagina | nu |
| Legislație – bunăstarea animalelor | https://www.ansvsa.ro/legislatie/bunastarea-animalelor/ | index | nu |
| Legislație – sănătatea animalelor | http://www.ansvsa.ro/legislatie/sanatatea-si-bunastarea-animalelor/ | index | nu |
| Ghiduri și proceduri specifice | https://www.ansvsa.ro/legislatie/ghiduri-si-proceduri-specifice/ | index | nu |
| Proceduri specifice | https://www.ansvsa.ro/legislatie/proceduri-specifice/ | index | nu |
| Date de contact | https://www.ansvsa.ro/date-de-contact/ | pagina | nu |

### 4.9 ONVPV – Oficiul Național al Viei și Produselor Vitivinicole

| Titlu | URL | Tip | Verificat |
| --- | --- | --- | --- |
| Registrul Plantațiilor Viticole | https://www.onvpv.ro/ro/content/registru-viticol | pagina | da |
| Sistemul de autorizații pentru plantări 2016-2045 | https://www.onvpv.ro/ro/content/sistemul-de-autorizatii-pentru-plantari-de-vita-de-vie-2016-2045 | pagina | da |
| Suprafața disponibilă pentru plantări noi 2026 | https://www.onvpv.ro/ro/content/suprafata-disponibila-pentru-acordarea-de-autorizatii-pentru-plantari-noi-anul-2026 | pagina | da |
| Legislație națională vitivinicolă | https://www.onvpv.ro/ro/node/23 | index | da |
| OMADR 117/2023 – restructurare/reconversie | https://www.onvpv.ro/sites/default/files/monitorul_oficial_partea_i_nr._258bis_0.pdf | pdf | da |
| Anunț publicare OMADR 117/2023 | https://www.onvpv.ro/ro/content/fost-publicat-monitorul-oficial-ordinul-ministrului-agriculturii-si-dezvoltarii-rurale-nr | pagina | da |
| OMADR 314/2024 – modificare OM 117/2023 | http://www.onvpv.ro/sites/default/files/omadr_314_din_2024_modif_om_117_2023_reconversie.pdf | pdf | da |
| Legea viei și vinului 164/2015 | https://www.onvpv.ro/sites/default/files/legea-164-2015-forma-sintetica-pentru-data-2018-02-06.pdf | pdf | da |
| HG 512/2016 – norme de aplicare | https://www.onvpv.ro/sites/default/files/hg_512_2016_norme_la_legea_viei_si_vinului_164_2015.pdf | pdf | da |
| OMADR 273/2020 – soiuri de struguri de vin | https://www.onvpv.ro/sites/default/files/ord_273_2020_lista_soiuri.pdf | pdf | da |

### 4.10 GAL / LEADER

| Titlu | URL | Tip | Verificat |
| --- | --- | --- | --- |
| Lista GAL-urilor 2023-2027, cu contacte (10.02.2026) | https://www.madr.ro/docs/dezvoltare-rurala/Axa_LEADER/2023-2027/2026/Lista-cu-Grupurile-de-Actiune-Locala-2023-2027-selectate-de-MADR-si-datele-de-contact-ale-acestora-actualizata-la-data-de-10.02.2026.pdf | pdf | nu |
| MADR – LEADER 2023-2027 | https://www.madr.ro/axa-leader/leader-2023-2027.html | index | nu |
| MADR – implementarea SDL 2023-2027 | https://www.madr.ro/axa-leader/leader-2023-2027/implementarea-strategiilor-de-dezvoltare-locala-2023-2027.html | index | nu |
| Manual implementare SDL (18.06.2025) | https://www.madr.ro/docs/dezvoltare-rurala/Axa_LEADER/2023-2027/2025/Manual-impl-SDL-2023-2027--v1-rectificat-18.06.2025.pdf | pdf | nu |
| Ghidul GAL pentru SDL, v2 | https://www.madr.ro/docs/dezvoltare-rurala/Axa_LEADER/2023-2027/2025/GS-GAL-2023-2027-versiunea-2.pdf | pdf | nu |
| FNGAL – harta GAL-urilor | https://fngal.ro/harta-gal-uri/ | pagina | da |
| FNGAL – LEADER | https://fngal.ro/leader/ | pagina | da |
| Rețeaua Rurală Națională / Rețeaua PAC | https://www.rrn-pac.eu | index | nu |

Notă: apelurile de proiecte LEADER se publică pe site-ul fiecărui GAL. După prima rulare, scriptul poate extrage site-urile GAL din PDF-ul MADR de mai sus (dacă e accesibil) și le poate adăuga ca surse `index`.

### 4.11 Comisia Europeană

| Titlu | URL | Tip | Verificat |
| --- | --- | --- | --- |
| Planul strategic PAC – România | https://agriculture.ec.europa.eu/cap-my-country/cap-strategic-plans/romania_ro | index | da |
| Planul strategic PAC al României, pe scurt | https://agriculture.ec.europa.eu/document/download/0c93098c-927c-4691-8c4d-8225fa5dfde5_ro?filename=csp-at-a-glance-romania_ro.pdf | pdf | da |
| Decizia de aprobare | https://agriculture.ec.europa.eu/document/download/37b0d9ba-7a4d-4707-a6c4-a47f93d1ab2e_ro?filename=csp-implementing-decision-romania_ro.pdf | pdf | da |
| Anexa la decizie | https://agriculture.ec.europa.eu/document/download/6e0c9bfb-fe35-4029-91aa-9c402df7690b_ro?filename=csp-annex-romania_ro_0.pdf | pdf | da |
| Beneficiarii PAC – transparență | https://agriculture.ec.europa.eu/common-agricultural-policy/financing-cap/beneficiaries_ro | pagina | da |
| Registrul ajutoarelor de stat (cazuri SA) | https://competition-cases.ec.europa.eu/search?caseInstrument=SA | pagina | da |
| Căutare ajutoare de stat acordate (TAM) | https://webgate.ec.europa.eu/competition/transparency/public?lang=en | pagina | da |
| Legislația UE privind ajutoarele de stat | https://competition-policy.ec.europa.eu/state-aid/legislation_en | index | da |
| PAC după 2027 | https://agriculture.ec.europa.eu/common-agricultural-policy/cap-post-2027-next-eu-budget_ro | pagina | da |
| Întrebări și răspunsuri PAC post-2027 | https://agriculture.ec.europa.eu/media/news/questions-and-answers-cap-post-2027-proposal-2025-07-23_ro | pagina | da |
| Rețeaua PAC a UE – România | https://eu-cap-network.ec.europa.eu/countries/romania_en | index | da |
| Rețeaua PAC a UE – căutare proiecte | https://eu-cap-network.ec.europa.eu/projects/search_en | pagina | da |
| Regulamentul (UE) 2021/2115 | https://eur-lex.europa.eu/legal-content/RO/TXT/?uri=CELEX%3A32021R2115 | pagina | da |

### 4.12 Direcțiile Agricole Județene (DAJ)

Toate sunt de tip `index` (site-urile publică anunțuri și sesiuni de informare). Neamț: site negăsit; contact secretariat.neamt@madr.ro.

| Județ | URL | Verificat |
| --- | --- | --- |
| Alba | https://dadrab.madr.ro/ | da |
| Arad | https://www.dadrarad.ro/ | da |
| Argeș | http://dadrarges.ro/new/index.php/en/ | da |
| Bacău | https://dajbacau.ro/ | da |
| Bihor | https://www.directiaagricolabihor.ro/ | nu |
| Bistrița-Năsăud | https://dabn.ro/ | nu |
| Botoșani | https://dadrbt.ro/nou/ | nu |
| Brăila | https://www.dadr-braila.ro/ | da |
| Brașov | https://dadrbv.madr.ro/ | da |
| București | http://www.damb.ro/ | nu |
| Buzău | https://dadrbz.madr.ro/ | da |
| Călărași | https://dajcalarasi.ro/ | nu |
| Caraș-Severin | https://www.dadrcs.ro/ | nu |
| Cluj | https://dadrcj.ro/wordpress/ | nu |
| Constanța | https://www.dadr-ct.ro/ | nu |
| Covasna | https://dadrcv.madr.ro/ | da |
| Dâmbovița | https://dadrdambovita.ro/ | nu |
| Dolj | https://directiaagricoladolj.ro/ | da |
| Galați | https://dajgalati.ro/ | da |
| Giurgiu | https://dadrgr.madr.ro/ | da |
| Gorj | https://www.dadrgorj.ro/ | nu |
| Harghita | https://dadrhr.madr.ro/ | da |
| Hunedoara | https://www.dajhunedoara.ro/ | nu |
| Ialomița | https://dadril.madr.ro/ | da |
| Iași | https://www.dajiasi.ro/ | da |
| Ilfov | https://dadrif.madr.ro/ | da |
| Maramureș | https://dadrmaramures.ro/ | da |
| Mehedinți | https://dadrmh.madr.ro/ | da |
| Mureș | http://www.dadr-mures.ro/ | nu |
| Neamț | – | negăsit |
| Olt | https://www.dadr-olt.ro/dadr-new/ | da |
| Prahova | https://dadrph.madr.ro/ | da |
| Sălaj | https://dadrsj.madr.ro/ | da |
| Satu Mare | http://www.dadr-sm.ro/ | nu |
| Sibiu | https://www.dadrsibiu.ro/ | nu |
| Suceava | https://dadrsv.madr.ro/ | da |
| Teleorman | https://directiaagricolateleorman.ro/ | nu |
| Timiș | https://dajtimis.ro/ | da |
| Tulcea | https://dadrtulcea.ro/ | da |
| Vâlcea | https://dadrvalcea.ro/ | da |
| Vaslui | https://dadrvs.madr.ro/ | da |
| Vrancea | http://www.dajvrancea.ro/ | da (ultima actualizare 2018) |
