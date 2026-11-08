# 09. Demo și pitch

## 1. Criteriile juriului și cum le bifăm

| Criteriu | Pondere | Ce arătăm |
|---|---|---|
| **Business fit** | 30% | Un public clar (FMM de 5–50 ha, 671.334 de cereri APIA în 2026), o problemă specific românească (APIA în tranșe, 15 luni, CAS opțional, insolvențe +80%). Diferențierea: nimeni nu face planificare pentru ferma mică. Adopție: prin fiica fermierului, asociații și băncile care dau credit pe adeverință. |
| **User experience** | 25% | 4 taburi, 4 întrebări. Cifre mari, română simplă, fără jargon. Onboarding de 2 minute. Incertitudinea explicată fără procente. |
| **Technical implementation** | 25% | Motor de reguli declarativ, testat (test case-ul de 3.195 €). Algoritm de netezire cu cazuri-limită. Stripe Connect, payouts, subscriptions, webhooks și Test Clocks, funcționale cap-coadă. |
| **Delivery & pitch** | 20% | O singură persoană (Ion), o singură poveste (anul lui), un moment „wow” (dăm timpul înainte și vedem salariul plătit lună de lună). Live la https://cropcash.netlify.app. |

## 2. Cele 4 lucruri cerute de brief și unde apar

| Cerința | Unde, în demo |
|---|---|
| Pe cine servește și ce problemă rezolvă | minutul 0:00–0:40 (Ion și ciclul „bani mulți, apoi credit”) |
| Experiența principală, cap-coadă | minutul 0:40–3:40 (onboarding → subvenție → calendar → plicuri → timp → secetă → pensie) |
| De ce e relevant în România | APIA, tranșe, curs pe fond, CAS opțional, insolvențe, pe parcursul demo-ului și în 3:40–4:10 |
| Asumpții, surse, reglementare, limitări | minutul 4:10–4:40 plus slide-ul final cu sursele |

## 3. Scriptul (4:40)

| Timp | Ce se vede | Ce spunem |
|---|---|---|
| 0:00–0:40 | Poza lui Ion, apoi graficul anului cu valuri și golul primăvara | „Ion are 15 hectare în Teleorman. Primește banii de 3 ori pe an, dar îi cheltuie în fiecare lună. În martie–mai rămâne fără bani și ia credit. N-are nimic deoparte pentru secetă și n-are pensie. Ca el sunt sute de mii.” |
| 0:40–1:10 | **Onboarding** pe telefon: Teleorman, 8 ha grâu, 7 ha porumb, 55 de ani | „Fiica lui completează în două minute. Fără formulare APIA, fără termeni financiari.” |
| 1:10–1:40 | **Subvenția ca interval**: „cam 16.900 lei, între 15.200 și 17.100” | „Alte aplicații îți dau o cifră. Noi îți spunem adevărul: cuantumul depinde de câți fermieri declară. Anul trecut, BISS a ieșit cu 10% sub plan. Avansul de 75% e sigur, restul nu.” |
| 1:40–2:10 | **Calendarul**, cu golul februarie–mai colorat | „Totul pe o singură axă: când vin banii, când pleacă, ce termene are. Și aici e problema.” |
| 2:10–2:35 | „**Au intrat 12.649 lei!**”, cu împărțirea pe plicuri („Bine așa”), apoi „Iau un credit” | „Avansul a intrat în contul lui Ion, prin Stripe Connect. Aplicația propune împărțirea: cheltuielile fermei, salariul, pensia. Fără credit, poate scoate sigur 1.050 lei pe lună. Cu un credit pe adeverință de 15.100 lei în aprilie, 2.950 lei. CropCash i-l anunță din noiembrie, nu în panică.” |
| 2:35–2:50 | **Pensia**: slider la 200 lei, „la 65 de ani ai cam 29.000 lei”, apoi „Pornesc” | „CAS-ul opțional costă 12.150 lei pe an. Pilonul III pornește de la orice sumă. Din 2027 vine și CEI. Pensia iese din salariu, deci salariul plătit devine 2.700 lei.” |
| 2:50–3:20 | **„Dăm timpul înainte 6 luni”** (Test Clock, ~1,5 min): 5 salarii de 2.700 lei, pensia lună de lună, restul de la APIA în martie, creditul în aprilie; în mai salariul scade la 2.450 lei | „Asta nu e o animație. Sunt payouts și subscriptions reale în Stripe test mode. Și uitați-vă la mai: aplicația vede că în noiembrie Ion dă creditul înapoi, așa că îi scade salariul acum, ca să nu rămână fără bani.” |
| 3:20–3:40 | **Toggle „An slab”** în Prognoză: venitul pe 2027 scade la ~79.000 lei (față de ~98.000), salariul sigur ajunge la 0 | „Într-un an de secetă, lui Ion îi intră cu ~19.000 lei mai puțin. CropCash i-o arată de acum, nu în mai, iar salariul sigur e cât poate scoate și într-un an ca ăsta.” |
| 3:40–4:10 | Slide cu concurența | (secțiunea 4) |
| 4:10–4:40 | Slide cu limitările | (secțiunea 5) „Ion nu are nevoie de mai mulți bani. Are nevoie să-i vadă pe un an întreg.” |

**Pregătirea demo-ului:** contul lui Ion e creat dinainte (`npm run seed:demo`, ~20 s, date în `docs/data/demo-ion.json`), Test Clock-ul e la 15 noiembrie 2026 și avansul încă nu e simulat. `npm run demo:rehearse` rulează scriptul de mai sus de 3 ori la rând pe Supabase și Stripe reale și afișează cifrele de spus lângă cele din aplicație; după el, rulează iar `seed:demo`. Avem și un video de rezervă, dacă pică rețeaua.

**Unde deschidem (din 8 nov 2026, aplicația cere cont):**
- **Începem pe ferma lui Ion, `/ferma-lui-ion/acasa`** (butonul „Vezi ferma lui Ion” de pe prima pagină). Arată că oricine poate vedea aplicația fără cont. Nu mută bani: pagina Bani e un exemplu calculat din planul lui Ion.
- **De la onboarding încolo (0:40) suntem în cont:** `/login` cu `DEMO_EMAIL`. Onboarding-ul și tot ce trece prin Stripe (2:10–3:20) cer cont. Intră în cont înainte de demo; ferma lui Ion rămâne exemplul și pentru cine e logat, deci nu încurcă.
- **Cifrele din script sunt cele din cont.** Ferma lui Ion pornește cu pensia de 200 lei deja scăzută, deci acolo salariul e 850 lei, nu 1.050. Nu citi cifrele din script de pe acea pagină.

**Cifrele de mai sus vin din aplicație** (verificate cu `demo:rehearse`, 3 repetiții fără erori, 8 nov 2026, după scoaterea fondului pentru ani proști). Dacă se schimbă datele din `docs/data`, se schimbă și ele: rulează repetiția și actualizează tabelul.

## 4. Concurența și diferențierea

| Produs | Ce face | De ce nu e CropCash |
|---|---|---|
| **Agricover Pay** (lansat în octombrie 2026) | cont, card, credit Agricover | E legat de creditor și nu face planificare. |
| **Agricover Crop360, AGRIVI, AgroCity** | management operațional (parcele, lucrări) | Sunt pentru ferme profesioniste și nu se ocupă de banii personali ai fermierului. |
| **Figured (NZ), Harvest Profit (SUA)** | planificare financiară pentru ferme | Nu sunt adaptate la România: APIA, tranșe, curs pe fond, PFA. |
| Creditul pe adeverință (bănci, IFN-uri) | acoperă golul | Mută problema, nu o rezolvă. Noi îl planificăm. |

**Diferențierea CropCash:** e pentru ferma mică, fără limbaj financiar; face din subvenție și recoltă un salariu lunar și o pensie; are reguli APIA cu incertitudine cinstită.

## 5. Limitările de spus deschis

1. **Datele sunt simulate:** încasările APIA și vânzările sunt plăți de test. Istoricul județului e ilustrativ până la integrarea datelor INS.
2. **Banii reali necesită un partener licențiat** (instituție de plată sau bancă). Stripe e în test mode.
   - **Spunem înainte să întrebe juriul:** APIA plătește prin Trezorerie, cu transfer bancar, în IBAN-ul fermierului. Nu plătește prin Stripe. În demo, „avansul APIA” e o plată de test. În producție, CropCash ar **vedea** plata în banca fermierului prin open banking (de exemplu, Salt Edge), iar banii n-ar pleca din banca lui. Stripe ar rămâne pentru partea de bani pe care o gestionează platforma: abonamentul CropCash, contribuțiile automate prin partener.
3. **Unele cifre sunt de verificat** în textul Planului Strategic PAC: pragul CRISS, PD-05, PD-28, schemele cuplate, cursul 2026. În aplicație apar marcate „(de verificat)”.
4. **Nu există integrare cu APIA sau AGI Online**, pentru că nu există un API public. Datele vin de la fermier sau din PDF-ul deciziei.
5. **Nu e consultanță financiară:** simulările de pensie folosesc randamente presupuse (2/4/6%).
6. **Asistentul „Întreabă” cere internet** și răspunde doar din cifrele aplicației. Nu salvează nimic singur: fiecare vânzare sau cheltuială propusă e un card pe care Ion îl apasă.

## 6. Surse (slide final)

economedia.ro (campania 2026) · forbes.ro (insolvențe) · economica.net și financiarul.ro (cuantumuri) · agrointel.ro (PD-04) · capital.ro (costuri) · contapp.ro (CAS) · bugetul.ro (Pilonul III) · alba24.ro (CEI) · comunicatul APIA din 27 mai 2026 (creditul).
