# Sample Documents for Smart Vault Demo

These sample files can be uploaded during demo testing. In `AI_MOCK=true` mode, the backend inspects the filename keywords to return realistic canned extraction data with dynamically calculated fresh dates.

## File Keyword Triggers
- `insurance_honda.jpg` -> Returns Vehicle Insurance (expires in **today + 12 days**)
- `puc_honda.jpg` -> Returns PUC Certificate (expires in **today + 25 days**)
- `rc_honda.jpg` -> Returns Registration Certificate (RC)
- `electricity_flat302.jpg` -> Returns Electricity Bill (utility address proof)
- `hindi_insurance.jpg` -> Returns Hindi-language Insurance Policy (`language: "hi"`)
- `rent_agreement.pdf` -> Returns Residential Tenancy Agreement
- `aadhaar_self.jpg` / `aadhaar.jpg` -> Returns Aadhaar card with masked number
- `pan.jpg` -> Returns PAN card
- `driving_license.jpg` / `license.jpg` -> Returns Driving License (DL)
- `property_tax.jpg` / `tax_receipt.jpg` -> Returns Property Tax Receipt
- `passport.jpg` -> Returns Passport
- Any other name -> Returns `Other` document type with low confidence (<0.5)
