# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ocr.browser.spec.ts >> benchmarks browser OCR: top-rows-with-boundary-overlay
- Location: tests/ocr.browser.spec.ts:123:3

# Error details

```
AssertionError: {
  "captureId": "top-rows-with-boundary-overlay",
  "matchedRows": 10,
  "expectedRows": 10,
  "missingRows": [],
  "extraRows": 0,
  "nameMismatches": 2,
  "teamMismatches": 0,
  "numericMismatches": 6,
  "uncertainRows": [
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10
  ]
}
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - banner [ref=e4]:
      - generic [ref=e5]:
        - link "Throne / WARGAMES" [ref=e6] [cursor=pointer]:
          - /url: /
          - generic [ref=e17]:
            - generic [ref=e18]: Throne
            - generic [ref=e19]: / WARGAMES
        - navigation "Primary navigation" [ref=e20]:
          - link "Home" [ref=e21] [cursor=pointer]:
            - /url: /
          - link "Rankings" [ref=e22] [cursor=pointer]:
            - /url: /leaderboard
          - link "Players" [ref=e23] [cursor=pointer]:
            - /url: /players
          - link "Match archive" [ref=e24] [cursor=pointer]:
            - /url: /matches
        - generic [ref=e25]:
          - link "Enter your six" [ref=e26] [cursor=pointer]:
            - /url: /apply
          - button "Switch to light mode" [pressed] [ref=e30]
          - link "Operations access" [ref=e37] [cursor=pointer]:
            - /url: /admin
    - main [ref=e42]:
      - generic [ref=e43]:
        - generic [ref=e46]:
          - generic [ref=e47]: Operations / restricted
          - heading "Keep the record honest." [level=1] [ref=e48]: Keep therecord honest.
          - paragraph [ref=e49]: Operator tools for verified match commits, application review, and visitor telemetry. Public viewing never requires an account; writes do.
        - generic [ref=e50]:
          - generic [ref=e51]:
            - generic [ref=e52]:
              - generic [ref=e58]: Visitors today
              - generic [ref=e59]: "0"
            - generic [ref=e60]:
              - generic [ref=e63]: Visitors this week
              - generic [ref=e64]: "0"
            - generic [ref=e65]:
              - generic [ref=e70]: Application queue
              - generic [ref=e71]: "0"
            - generic [ref=e72]:
              - generic [ref=e76]: OCR confidence
              - generic [ref=e77]: —
          - generic [ref=e78]:
            - generic [ref=e79]: Operator name for audit records
            - textbox "Operator name for audit records" [ref=e80]:
              - /placeholder: Your name or operator handle
              - text: Browser OCR test
          - generic [ref=e81]:
            - generic [ref=e82]:
              - generic [ref=e84]:
                - generic [ref=e85]: Visitor telemetry
                - heading "Audience signal" [level=2] [ref=e86]
              - generic [ref=e90]:
                - generic [ref=e91]: archive
                - generic [ref=e93]: applications
            - generic [ref=e95]:
              - heading "Commit the next verified result." [level=2] [ref=e101]: Commit the nextverified result.
              - paragraph [ref=e102]: Scoreboards are written to the public record only after an authorized operator checks the formation.
              - button "Open commit form" [ref=e103]
          - generic [ref=e105]:
            - generic [ref=e106]:
              - generic [ref=e107]:
                - generic [ref=e108]: Operator action / new match
                - heading "Write a verified scoreline." [level=2] [ref=e109]
              - button "Close panel" [ref=e110]
            - generic [ref=e111]:
              - generic [ref=e112]:
                - generic [ref=e113]:
                  - button "image_1789717304337.png PNG, JPEG, or WebP · any screenshot size" [ref=e114]:
                    - generic [ref=e119]: image_1789717304337.png
                    - generic [ref=e120]: PNG, JPEG, or WebP · any screenshot size
                  - button "Choose File" [ref=e121]
                  - generic [ref=e122]:
                    - generic [ref=e123]:
                      - img "Scoreboard awaiting OCR" [ref=e124]
                      - generic: Rank
                      - generic: Weapons
                      - generic: Guild
                      - generic: Name
                      - generic: Team
                      - generic: Kills
                      - generic: Assists
                      - generic: Damage
                      - generic: Taken
                      - generic: Healing
                    - generic [ref=e125]:
                      - generic [ref=e126]:
                        - generic [ref=e127]: Adjust OCR Columns
                        - button "Reset Defaults" [ref=e128]
                      - generic [ref=e129]:
                        - generic [ref=e130]: Rank / Weapons
                        - slider [ref=e131]: "10.5"
                        - generic [ref=e132]: 10.5%
                      - generic [ref=e133]:
                        - generic [ref=e134]: Weapons / Guild
                        - slider [ref=e135]: "15.5"
                        - generic [ref=e136]: 15.5%
                      - generic [ref=e137]:
                        - generic [ref=e138]: Guild / Name
                        - slider [ref=e139]: "34"
                        - generic [ref=e140]: 34.0%
                      - generic [ref=e141]:
                        - generic [ref=e142]: Name / Team
                        - slider [ref=e143]: "52.5"
                        - generic [ref=e144]: 52.5%
                      - generic [ref=e145]:
                        - generic [ref=e146]: Team / Kills
                        - slider [ref=e147]: "59.5"
                        - generic [ref=e148]: 59.5%
                      - generic [ref=e149]:
                        - generic [ref=e150]: Kills / Assists
                        - slider [ref=e151]: "66"
                        - generic [ref=e152]: 66.0%
                      - generic [ref=e153]:
                        - generic [ref=e154]: Assists / Damage
                        - slider [ref=e155]: "72.5"
                        - generic [ref=e156]: 72.5%
                      - generic [ref=e157]:
                        - generic [ref=e158]: Damage / Taken
                        - slider [ref=e159]: "81.5"
                        - generic [ref=e160]: 81.5%
                      - generic [ref=e161]:
                        - generic [ref=e162]: Taken / Healing
                        - slider [ref=e163]: "91.2"
                        - generic [ref=e164]: 91.2%
                  - paragraph [ref=e165]: 1365×507 accepted. OCR will scale it automatically while preserving its aspect ratio.
                  - button "Extract scoreboard" [ref=e166]
                  - generic [ref=e172]:
                    - button "Try enhanced OCR" [ref=e173]
                    - paragraph [ref=e179]: Sends this screenshot to the configured external OCR provider. Missing fields may be suggested; disagreements remain flagged for review.
                - generic [ref=e180]:
                  - generic [ref=e181]:
                    - generic [ref=e182]:
                      - generic [ref=e183]: Verification status
                      - generic [ref=e184]: 10 rows extracted for operator review
                      - generic [ref=e185]: 10 rows need attention · contrast image pass selected
                    - generic [ref=e186]: 73% OCR
                  - paragraph [ref=e187]: OCR is a draft for two teams of up to 48 players each. Check every field against the screenshot, then confirm each row. Editing a row clears its confirmation.
              - generic [ref=e188]:
                - generic [ref=e189]:
                  - generic [ref=e190]: Match date
                  - textbox "Match date" [ref=e191]
                - generic [ref=e192]:
                  - generic [ref=e193]: Winning team
                  - combobox "Winning team" [ref=e194]:
                    - option "Blue" [selected]
                    - option "Red"
                    - option "Yellow"
                - generic [ref=e195]:
                  - generic [ref=e196]: Field note
                  - textbox "Field note" [ref=e197]:
                    - /placeholder: What decided the fight?
              - generic [ref=e198]:
                - table [ref=e199]:
                  - rowgroup [ref=e200]:
                    - row [ref=e201]:
                      - columnheader "Team" [ref=e202]
                      - columnheader "Character" [ref=e203]
                      - columnheader "Main weapon" [ref=e204]
                      - columnheader "Off weapon" [ref=e205]
                      - columnheader "Kills" [ref=e206]
                      - columnheader "Assists" [ref=e207]
                      - columnheader "Damage" [ref=e208]
                      - columnheader "Taken" [ref=e209]
                      - columnheader "Healing" [ref=e210]
                      - columnheader "Check" [ref=e211]
                      - columnheader [ref=e212]
                  - rowgroup [ref=e213]:
                    - row [ref=e214]:
                      - cell "Red" [ref=e215]:
                        - combobox "Team 1" [ref=e216]:
                          - option "Review team"
                          - option "Blue"
                          - option "Red" [selected]
                          - option "Yellow"
                      - cell [ref=e217]:
                        - textbox "Character 1" [ref=e218]
                      - cell "Select class" [ref=e219]:
                        - combobox "Class" [ref=e220]:
                          - option "Select class" [selected]
                      - cell "Select class" [ref=e221]:
                        - combobox "Class" [ref=e222]:
                          - option "Select class" [selected]
                      - cell [ref=e223]:
                        - spinbutton "kills 1" [ref=e224]: "143"
                      - cell [ref=e225]:
                        - spinbutton "assists 1" [ref=e226]: "223"
                      - cell [ref=e227]:
                        - spinbutton "damageDealt 1" [ref=e228]: "8725957"
                      - cell [ref=e229]:
                        - spinbutton "damageTaken 1" [ref=e230]: "5219315"
                      - cell [ref=e231]:
                        - spinbutton "healingDone 1" [ref=e232]: "27402"
                      - cell [ref=e233]:
                        - generic [ref=e234]:
                          - checkbox "Confirm row 1" [ref=e235]
                          - text: Confirm
                      - cell [ref=e238]:
                        - button "Remove row 1" [ref=e239]
                    - row [ref=e243]:
                      - cell "Yellow" [ref=e244]:
                        - combobox "Team 2" [ref=e245]:
                          - option "Review team"
                          - option "Blue"
                          - option "Red"
                          - option "Yellow" [selected]
                      - cell [ref=e246]:
                        - textbox "Character 2" [ref=e247]: Milio-
                      - cell "Select class" [ref=e248]:
                        - combobox "Class" [ref=e249]:
                          - option "Select class" [selected]
                      - cell "Select class" [ref=e250]:
                        - combobox "Class" [ref=e251]:
                          - option "Select class" [selected]
                      - cell [ref=e252]:
                        - spinbutton "kills 2" [ref=e253]: "141"
                      - cell [ref=e254]:
                        - spinbutton "assists 2" [ref=e255]: "140"
                      - cell [ref=e256]:
                        - spinbutton "damageDealt 2" [ref=e257]: "9945289"
                      - cell [ref=e258]:
                        - spinbutton "damageTaken 2" [ref=e259]: "2798420"
                      - cell [ref=e260]:
                        - spinbutton "healingDone 2" [ref=e261]: "90970"
                      - cell [ref=e262]:
                        - generic [ref=e263]:
                          - checkbox "Confirm row 2" [ref=e264]
                          - text: Confirm
                      - cell [ref=e267]:
                        - button "Remove row 2" [ref=e268]
                    - row [ref=e272]:
                      - cell "Red" [ref=e273]:
                        - combobox "Team 3" [ref=e274]:
                          - option "Review team"
                          - option "Blue"
                          - option "Red" [selected]
                          - option "Yellow"
                      - cell [ref=e275]:
                        - textbox "Character 3" [ref=e276]: WolfFR
                      - cell "Select class" [ref=e277]:
                        - combobox "Class" [ref=e278]:
                          - option "Select class" [selected]
                      - cell "Select class" [ref=e279]:
                        - combobox "Class" [ref=e280]:
                          - option "Select class" [selected]
                      - cell [ref=e281]:
                        - spinbutton "kills 3" [ref=e282]: "7"
                      - cell [ref=e283]:
                        - spinbutton "assists 3" [ref=e284]: "154"
                      - cell [ref=e285]:
                        - spinbutton "damageDealt 3" [ref=e286]: "7631081"
                      - cell [ref=e287]:
                        - spinbutton "damageTaken 3" [ref=e288]: "1492813"
                      - cell [ref=e289]:
                        - spinbutton "healingDone 3" [ref=e290]: "2710"
                      - cell [ref=e291]:
                        - generic [ref=e292]:
                          - checkbox "Confirm row 3" [ref=e293]
                          - text: Confirm
                      - cell [ref=e296]:
                        - button "Remove row 3" [ref=e297]
                    - row [ref=e301]:
                      - cell "Red" [ref=e302]:
                        - combobox "Team 4" [ref=e303]:
                          - option "Review team"
                          - option "Blue"
                          - option "Red" [selected]
                          - option "Yellow"
                      - cell [ref=e304]:
                        - textbox "Character 4" [ref=e305]: holydumpling
                      - cell "Select class" [ref=e306]:
                        - combobox "Class" [ref=e307]:
                          - option "Select class" [selected]
                      - cell "Select class" [ref=e308]:
                        - combobox "Class" [ref=e309]:
                          - option "Select class" [selected]
                      - cell [ref=e310]:
                        - spinbutton "kills 4" [ref=e311]: "103"
                      - cell [ref=e312]:
                        - spinbutton "assists 4" [ref=e313]: "209"
                      - cell [ref=e314]:
                        - spinbutton "damageDealt 4" [ref=e315]: "8421639"
                      - cell [ref=e316]:
                        - spinbutton "damageTaken 4" [ref=e317]: "2557461"
                      - cell [ref=e318]:
                        - spinbutton "healingDone 4" [ref=e319]: "4"
                      - cell [ref=e320]:
                        - generic [ref=e321]:
                          - checkbox "Confirm row 4" [ref=e322]
                          - text: Confirm
                      - cell [ref=e325]:
                        - button "Remove row 4" [ref=e326]
                    - row [ref=e330]:
                      - cell "Red" [ref=e331]:
                        - combobox "Team 5" [ref=e332]:
                          - option "Review team"
                          - option "Blue"
                          - option "Red" [selected]
                          - option "Yellow"
                      - cell [ref=e333]:
                        - textbox "Character 5" [ref=e334]: But:-WhyT
                      - cell "Select class" [ref=e335]:
                        - combobox "Class" [ref=e336]:
                          - option "Select class" [selected]
                      - cell "Select class" [ref=e337]:
                        - combobox "Class" [ref=e338]:
                          - option "Select class" [selected]
                      - cell [ref=e339]:
                        - spinbutton "kills 5" [ref=e340]: "85"
                      - cell [ref=e341]:
                        - spinbutton "assists 5" [ref=e342]: "157"
                      - cell [ref=e343]:
                        - spinbutton "damageDealt 5" [ref=e344]: "5987324"
                      - cell [ref=e345]:
                        - spinbutton "damageTaken 5" [ref=e346]: "2967060"
                      - cell [ref=e347]:
                        - spinbutton "healingDone 5" [ref=e348]: "0"
                      - cell [ref=e349]:
                        - generic [ref=e350]:
                          - checkbox "Confirm row 5" [ref=e351]
                          - text: Confirm
                      - cell [ref=e354]:
                        - button "Remove row 5" [ref=e355]
                    - row [ref=e359]:
                      - cell "Red" [ref=e360]:
                        - combobox "Team 6" [ref=e361]:
                          - option "Review team"
                          - option "Blue"
                          - option "Red" [selected]
                          - option "Yellow"
                      - cell [ref=e362]:
                        - textbox "Character 6" [ref=e363]: elNougato
                      - cell "Select class" [ref=e364]:
                        - combobox "Class" [ref=e365]:
                          - option "Select class" [selected]
                      - cell "Select class" [ref=e366]:
                        - combobox "Class" [ref=e367]:
                          - option "Select class" [selected]
                      - cell [ref=e368]:
                        - spinbutton "kills 6" [ref=e369]: "83"
                      - cell [ref=e370]:
                        - spinbutton "assists 6" [ref=e371]: "181"
                      - cell [ref=e372]:
                        - spinbutton "damageDealt 6" [ref=e373]: "4839646"
                      - cell [ref=e374]:
                        - spinbutton "damageTaken 6" [ref=e375]: "2383651"
                      - cell [ref=e376]:
                        - spinbutton "healingDone 6" [ref=e377]: "18165"
                      - cell [ref=e378]:
                        - generic [ref=e379]:
                          - checkbox "Confirm row 6" [ref=e380]
                          - text: Confirm
                      - cell [ref=e383]:
                        - button "Remove row 6" [ref=e384]
                    - row [ref=e388]:
                      - cell "Red" [ref=e389]:
                        - combobox "Team 7" [ref=e390]:
                          - option "Review team"
                          - option "Blue"
                          - option "Red" [selected]
                          - option "Yellow"
                      - cell [ref=e391]:
                        - textbox "Character 7" [ref=e392]: XDoju
                      - cell "Select class" [ref=e393]:
                        - combobox "Class" [ref=e394]:
                          - option "Select class" [selected]
                      - cell "Select class" [ref=e395]:
                        - combobox "Class" [ref=e396]:
                          - option "Select class" [selected]
                      - cell [ref=e397]:
                        - spinbutton "kills 7" [ref=e398]: "81"
                      - cell [ref=e399]:
                        - spinbutton "assists 7" [ref=e400]: "138"
                      - cell [ref=e401]:
                        - spinbutton "damageDealt 7" [ref=e402]: "4788678"
                      - cell [ref=e403]:
                        - spinbutton "damageTaken 7" [ref=e404]: "2314665"
                      - cell [ref=e405]:
                        - spinbutton "healingDone 7" [ref=e406]: "37089"
                      - cell [ref=e407]:
                        - generic [ref=e408]:
                          - checkbox "Confirm row 7" [ref=e409]
                          - text: Confirm
                      - cell [ref=e412]:
                        - button "Remove row 7" [ref=e413]
                    - row [ref=e417]:
                      - cell "Yellow" [ref=e418]:
                        - combobox "Team 8" [ref=e419]:
                          - option "Review team"
                          - option "Blue"
                          - option "Red"
                          - option "Yellow" [selected]
                      - cell [ref=e420]:
                        - textbox "Character 8" [ref=e421]: ClarkK +
                      - cell "Select class" [ref=e422]:
                        - combobox "Class" [ref=e423]:
                          - option "Select class" [selected]
                      - cell "Select class" [ref=e424]:
                        - combobox "Class" [ref=e425]:
                          - option "Select class" [selected]
                      - cell [ref=e426]:
                        - spinbutton "kills 8" [ref=e427]
                      - cell [ref=e428]:
                        - spinbutton "assists 8" [ref=e429]: "105"
                      - cell [ref=e430]:
                        - spinbutton "damageDealt 8" [ref=e431]: "5022582"
                      - cell [ref=e432]:
                        - spinbutton "damageTaken 8" [ref=e433]: "2900652"
                      - cell [ref=e434]:
                        - spinbutton "healingDone 8" [ref=e435]: "29730"
                      - cell [ref=e436]:
                        - generic [ref=e437]:
                          - checkbox "Confirm row 8" [ref=e438]
                          - text: Confirm
                      - cell [ref=e441]:
                        - button "Remove row 8" [ref=e442]
                    - row [ref=e446]:
                      - cell "Yellow" [ref=e447]:
                        - combobox "Team 9" [ref=e448]:
                          - option "Review team"
                          - option "Blue"
                          - option "Red"
                          - option "Yellow" [selected]
                      - cell [ref=e449]:
                        - textbox "Character 9" [ref=e450]: Josh
                      - cell "Select class" [ref=e451]:
                        - combobox "Class" [ref=e452]:
                          - option "Select class" [selected]
                      - cell "Select class" [ref=e453]:
                        - combobox "Class" [ref=e454]:
                          - option "Select class" [selected]
                      - cell [ref=e455]:
                        - spinbutton "kills 9" [ref=e456]: "61"
                      - cell [ref=e457]:
                        - spinbutton "assists 9" [ref=e458]: "132"
                      - cell [ref=e459]:
                        - spinbutton "damageDealt 9" [ref=e460]: "5681015"
                      - cell [ref=e461]:
                        - spinbutton "damageTaken 9" [ref=e462]: "1919537"
                      - cell [ref=e463]:
                        - spinbutton "healingDone 9" [ref=e464]
                      - cell [ref=e465]:
                        - generic [ref=e466]:
                          - checkbox "Confirm row 9" [ref=e467]
                          - text: Confirm
                      - cell [ref=e470]:
                        - button "Remove row 9" [ref=e471]
                    - row [ref=e475]:
                      - cell "Yellow" [ref=e476]:
                        - combobox "Team 10" [ref=e477]:
                          - option "Review team"
                          - option "Blue"
                          - option "Red"
                          - option "Yellow" [selected]
                      - cell [ref=e478]:
                        - textbox "Character 10" [ref=e479]: AimAssist-
                      - cell "Select class" [ref=e480]:
                        - combobox "Class" [ref=e481]:
                          - option "Select class" [selected]
                      - cell "Select class" [ref=e482]:
                        - combobox "Class" [ref=e483]:
                          - option "Select class" [selected]
                      - cell [ref=e484]:
                        - spinbutton "kills 10" [ref=e485]: "63"
                      - cell [ref=e486]:
                        - spinbutton "assists 10" [ref=e487]: "142"
                      - cell [ref=e488]:
                        - spinbutton "damageDealt 10" [ref=e489]: "5382813"
                      - cell [ref=e490]:
                        - spinbutton "damageTaken 10" [ref=e491]: "3041260"
                      - cell [ref=e492]:
                        - spinbutton "healingDone 10" [ref=e493]: "31258"
                      - cell [ref=e494]:
                        - generic [ref=e495]:
                          - checkbox "Confirm row 10" [ref=e496]
                          - text: Confirm
                      - cell [ref=e499]:
                        - button "Remove row 10" [ref=e500]
                - button "Add Row" [ref=e505]
              - button "Commit verified result" [disabled] [ref=e508]
          - generic [ref=e512]:
            - generic [ref=e513]:
              - generic [ref=e514]:
                - generic [ref=e515]: Catalog administration
                - heading "Classes for this game" [level=2] [ref=e516]
                - paragraph [ref=e517]: Active classes appear in applications, OCR review, and match correction. Disabling preserves historical records.
              - generic [ref=e518]:
                - generic [ref=e519]:
                  - generic [ref=e520]: Display name
                  - textbox "Display name" [ref=e521]:
                    - /placeholder: Spear
                - generic [ref=e522]:
                  - generic [ref=e523]: Class key
                  - textbox "Class key" [ref=e524]:
                    - /placeholder: SPEAR
                - generic [ref=e525]:
                  - generic [ref=e526]: OCR aliases
                  - textbox "OCR aliases" [ref=e527]:
                    - /placeholder: Spear, spear, SPEAR
                - button "Add class" [ref=e529]
            - generic [ref=e530]:
              - generic [ref=e531]:
                - generic [ref=e532]: Roster operations
                - heading "Application review" [level=2] [ref=e533]
              - paragraph [ref=e534]: No roster applications have been submitted.
            - generic [ref=e535]:
              - generic [ref=e536]:
                - generic [ref=e537]: Archive operations
                - heading "Correct verified records" [level=2] [ref=e538]
              - paragraph [ref=e539]: No archive matches exist yet.
    - contentinfo [ref=e540]:
      - generic [ref=e541]:
        - paragraph [ref=e542]: The record is the arena.
        - generic [ref=e543]:
          - link "Submit roster" [ref=e544] [cursor=pointer]:
            - /url: /apply
          - link "Operator access" [ref=e545] [cursor=pointer]:
            - /url: /admin
  - region "Notifications (F8)":
    - list
```

# Test source

```ts
  30  |   );
  31  |   for (const endpoint of ['applications', 'matches', 'classes']) {
  32  |     await page.route(`**/api/admin/${endpoint}**`, (route) =>
  33  |       route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  34  |     );
  35  |   }
  36  |   await page.route('**/api/classes', (route) =>
  37  |     route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  38  |   );
  39  |   await page.goto('/admin');
  40  |   await expect(page.getByTestId('button-open-commit')).toBeVisible();
  41  |   await page.getByTestId('button-open-commit').click();
  42  |   await expect(page.getByTestId('panel-commit-match')).toBeVisible();
  43  | }
  44  | 
  45  | async function runBrowserOcr(page: Page, sourcePath: string) {
  46  |   const panel = page.getByTestId('panel-commit-match');
  47  |   await panel.getByTestId('input-scoreboard-file').setInputFiles(path.resolve(artifactRoot, '..', '..', sourcePath));
  48  |   await expect(panel.getByTestId('button-run-ocr')).toBeEnabled();
  49  |   const runButton = panel.getByTestId('button-run-ocr');
  50  |   let lastProgress = '';
  51  |   const progressTimer = setInterval(() => {
  52  |     void runButton.textContent().then((text) => {
  53  |       const normalized = text?.trim() ?? '';
  54  |       if (normalized && normalized !== lastProgress) {
  55  |         lastProgress = normalized;
  56  |         process.stdout.write(`[browser-ocr] ${normalized}\n`);
  57  |       }
  58  |     }).catch(() => undefined);
  59  |   }, 5_000);
  60  |   try {
  61  |     await runButton.click();
  62  |     await expect(runButton).toHaveText('Extract scoreboard', { timeout: 180_000 });
  63  |     await expect(panel.getByText(/rows extracted for operator review/)).toBeVisible();
  64  |   } finally {
  65  |     clearInterval(progressTimer);
  66  |   }
  67  | 
  68  |   return panel.locator('tbody tr').evaluateAll((rows) =>
  69  |     rows.map((row) => {
  70  |       const inputValue = (selector: string) =>
  71  |         (row.querySelector(selector) as HTMLInputElement | HTMLSelectElement | null)?.value ?? '';
  72  |       const title = row.getAttribute('title') ?? '';
  73  |       return {
  74  |         rank: Number.parseInt(row.getAttribute('data-rank') ?? '', 10) || null,
  75  |         characterName: inputValue('input[aria-label^="Character "]'),
  76  |         team: inputValue('select[aria-label^="Team "]') || null,
  77  |         kills: inputValue('input[aria-label^="kills "]'),
  78  |         assists: inputValue('input[aria-label^="assists "]'),
  79  |         damageDealt: inputValue('input[aria-label^="damageDealt "]'),
  80  |         damageTaken: inputValue('input[aria-label^="damageTaken "]'),
  81  |         healingDone: inputValue('input[aria-label^="healingDone "]'),
  82  |         warnings: title ? title.split(' · ') : [],
  83  |       };
  84  |     }),
  85  |   );
  86  | }
  87  | 
  88  | function numericValue(value: string) {
  89  |   return value === '' ? null : Number(value);
  90  | }
  91  | 
  92  | function toCorpusExtraction(rows: Awaited<ReturnType<typeof runBrowserOcr>>) {
  93  |   return {
  94  |     participants: rows.map((row) => ({
  95  |       rank: row.rank,
  96  |       characterName: row.characterName,
  97  |       team: row.team as TeamColor | null,
  98  |       mainWeapon: null,
  99  |       offWeapon: null,
  100 |       kills: numericValue(row.kills),
  101 |       assists: numericValue(row.assists),
  102 |       damageDealt: numericValue(row.damageDealt),
  103 |       damageTaken: numericValue(row.damageTaken),
  104 |       healingDone: numericValue(row.healingDone),
  105 |       confidence: 100,
  106 |       fieldConfidence: {},
  107 |       warnings: row.warnings,
  108 |       confirmed: false,
  109 |     })),
  110 |   };
  111 | }
  112 | 
  113 | test('runs real browser OCR on a supplied scoreboard image', async ({ page }) => {
  114 |   test.setTimeout(240_000);
  115 |   await openScoreboardVerifier(page);
  116 |   const rows = await runBrowserOcr(page, 'attached_assets/1_1789717015998.png');
  117 | 
  118 |   expect(rows.length).toBeGreaterThan(0);
  119 |   expect(rows.some((row) => row.kills !== '' && row.damageDealt !== '')).toBe(true);
  120 | });
  121 | 
  122 | for (const capture of corpus) {
  123 |   test(`benchmarks browser OCR: ${capture.id}`, async ({ page }) => {
  124 |     test.setTimeout(240_000);
  125 |     process.stdout.write(`[browser-ocr] ${capture.id}: starting\n`);
  126 |     await openScoreboardVerifier(page);
  127 |     const rows = await runBrowserOcr(page, capture.sourcePath);
  128 |     const report = evaluateCorpusCapture(capture, toCorpusExtraction(rows));
  129 |     process.stdout.write(`[browser-ocr] ${capture.id}: ${report.matchedRows}/${report.expectedRows} rows, ${report.numericMismatches.length} numeric mismatches\n`);
> 130 |     assert.ok(report.passed, JSON.stringify({
      |            ^ AssertionError: {
  131 |       captureId: report.captureId,
  132 |       matchedRows: report.matchedRows,
  133 |       expectedRows: report.expectedRows,
  134 |       missingRows: report.missingRows,
  135 |       extraRows: report.extraRows,
  136 |       nameMismatches: report.nameMismatches.length,
  137 |       teamMismatches: report.teamMismatches.length,
  138 |       numericMismatches: report.numericMismatches.length,
  139 |       uncertainRows: report.uncertainRows,
  140 |     }, null, 2));
  141 |   });
  142 | }
```