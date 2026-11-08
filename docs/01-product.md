# 01. Produsul: CropCash

## Pitch-ul în 30 de secunde

> Ion are 15 hectare de grâu și porumb în Teleorman. Câștigă bani de 2–3 ori pe an: din recoltă vara și toamna și din subvenția APIA, care vine în bucăți, din octombrie până în iunie anul următor. Cheltuie însă în fiecare lună, și cel mai mult primăvara. Așa că trăiește în ciclul „bani mulți, apoi credit”, nu pune nimic deoparte pentru un an de secetă și nu are pensie.
>
> **CropCash îi transformă banii neregulați într-un salariu lunar și o pensie.** Îi arată cât primește de la APIA (ca interval realist, nu ca promisiune), când vin banii, ce termene are și dacă îi ajung banii până la următoarea încasare.

**Într-o frază:** CropCash transformă subvențiile și recolta, care vin în 2–3 valuri imprevizibile pe parcursul a până la 15 luni, într-un salariu lunar și o pensie, și îi spune fermierului la timp ce termene are și ce bani noi i se cuvin.

## Publicul

- Fermele mici și mijlocii (FMM), de aproximativ 5–50 ha, cu teren arabil și eventual animale.
- **De ce acest segment:** fermele foarte mici (sub 5 ha, 90,3% din total) au venituri prea mici ca să le planifici. Fermele mari au deja contabil și soft. FMM au bani suficienți cât să conteze planificarea, dar nu au pe nimeni care s-o facă.

## Persona: Ion

| | |
|---|---|
| Vârsta | 55+ ani |
| Ferma | 15 ha de cereale în Teleorman (date de demo: 8 ha grâu și 7 ha porumb) |
| Tehnologie | Doar telefonul, unul ieftin. Fiica lui îl ajută cu aplicațiile. |
| Bani | Încasează avansul APIA în octombrie–noiembrie, vinde grâul în iulie și porumbul în octombrie. Ia credit pe adeverința APIA ca să treacă de primăvară. |
| Frici | „Îmi ajung banii până la recoltă?”, „Cât îmi dă APIA anul ăsta?”, „Ce fac dacă e secetă?”, „Din ce trăiesc la bătrânețe?” |
| Ce vrea | Să știe în fiecare lună cât poate cheltui, fără calcule. |

**Persona secundară:** fiica lui Ion (30 de ani, la oraș). Face onboarding-ul și urcă PDF-urile. Ea trebuie convinsă că aplicația e de încredere.

## Propunerea de valoare

| Ce primește fermierul | Cum | Ecranul |
|---|---|---|
| **Salariu lunar** | Algoritmul de netezire calculează suma maximă pe lună pentru care banii nu se termină până la următoarea încasare. | „Câți bani am?” |
| **Pensie** | Contribuții mici, automate, la Pilonul III sau CEI, cu simulare la 65 de ani. | „Îmi ajung?” |
| **Asistent pentru termene și acte** | Un calendar unic cu bani, termene APIA și lucrări, plus rapoarte generate (de exemplu, motorina). | „Ce am de făcut?” |
| **Subvenția, cinstit** | Un interval minim / probabil / maxim, defalcat pe avans și sold. | „Când vin banii?” |
| **Întrebi aplicația** | Asistentul „Întreabă” răspunde în scris, din cifrele fermei. Arată efectul, iar decizia rămâne a fermierului. (Vocea a fost scoasă pe 8 nov 2026.) | Butonul „Întreabă”, pe fiecare pagină |

## Principiile de UX (obligatorii)

1. **Tot UI-ul e în română, cu diacritice**, cu limbaj simplu, de om de la țară.
2. **Cuvinte interzise în UI:** „lichiditate”, „cash-flow”, „portofoliu”, „randament”, „buget” (folosim „plicuri”), „venit net”. Spunem „bani”, „îți ajung”, „pui deoparte”, „salariu”.
3. **Cifre mari, puțin text, butoane mari.** Mobile-first, pe ecrane de 360 px lățime. Trebuie să meargă pe un telefon ieftin, cu o rețea slabă.
4. **Fiecare ecran răspunde la o singură întrebare:** „Câți bani am?”, „Când vin banii?”, „Îmi ajung?”, „Ce am de făcut?”.
5. **Sumele se afișează în lei.** Euro apare doar ca detaliu la subvenții.
6. **Incertitudinea se arată simplu:** „între 15.200 și 17.000 lei, cel mai probabil 16.900 lei”, nu procente sau deviații.
7. Textele de UI stau în pagini (`web/app/*/page.tsx` și `web/legacy/*.js`). `ro.json` a plecat odată cu `apps/web`; `web/lib/language.test.ts` caută cuvintele interzise.
8. **Asistentul nu salvează nimic singur.** Orice salvare propusă de el cere o apăsare pe un card cu valorile exacte.
