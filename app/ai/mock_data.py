from datetime import datetime, timedelta, timezone
from typing import Dict, Any


def get_mock_extraction(filename: str) -> Dict[str, Any]:
    """
    Returns realistic canned extraction JSON matching keywords in filename.
    Computes dynamic expiry dates:
    - insurance -> today + 12 days
    - puc -> today + 25 days
    """
    today = datetime.now(timezone.utc).date()
    lower_fn = filename.lower()

    # 1. Hindi document
    if "hindi" in lower_fn:
        return {
            "doc_type": "Insurance",
            "title": "एचडीएफसी एर्गो मोटर बीमा पॉलिसी",
            "fields": {
                "number": "2311-2049-8812-00",
                "holder_name": "राजेश कुमार शर्मा",
                "issue_date": (today - timedelta(days=353)).isoformat(),
                "expiry_date": (today + timedelta(days=12)).isoformat(),
                "issuer": "HDFC ERGO General Insurance Co. Ltd.",
                "extra": {"vehicle_model": "Honda City 1.5 V", "registration_no": "DL 01 AB 1234"},
            },
            "confidence": {
                "doc_type": 0.95,
                "number": 0.92,
                "holder_name": 0.88,
                "issue_date": 0.90,
                "expiry_date": 0.94,
            },
            "raw_text": "एचडीएफसी एर्गो जनरल इंश्योरेंस कंपनी लिमिटेड\nपॉलिसी संख्या: 2311-2049-8812-00\nबीमाधारक का नाम: राजेश कुमार शर्मा\nवाहन पंजीकरण संख्या: DL 01 AB 1234 (होंडा सिटी)\nपॉलिसी जारी तिथि: "
            + (today - timedelta(days=353)).isoformat()
            + "\nवैधता समाप्ति तिथि: "
            + (today + timedelta(days=12)).isoformat(),
            "language": "hi",
        }

    # 2. Vehicle Insurance (expires in 12 days)
    if "insurance" in lower_fn and "health" not in lower_fn:
        return {
            "doc_type": "Insurance",
            "title": "HDFC ERGO Comprehensive Private Car Policy",
            "fields": {
                "number": "2311-2049-8812-00",
                "holder_name": "Aarav Sharma",
                "issue_date": (today - timedelta(days=353)).isoformat(),
                "expiry_date": (today + timedelta(days=12)).isoformat(),
                "issuer": "HDFC ERGO General Insurance Co. Ltd.",
                "extra": {"registration_no": "DL-01-AB-1234", "idv_amount": "₹ 7,85,000"},
            },
            "confidence": {
                "doc_type": 0.98,
                "number": 0.96,
                "holder_name": 0.92,
                "issue_date": 0.94,
                "expiry_date": 0.97,
            },
            "raw_text": "HDFC ERGO General Insurance Company Limited\nCertificate of Insurance cum Policy Schedule\nPolicy No: 2311-2049-8812-00\nInsured Name: Aarav Sharma\nVehicle Reg No: DL-01-AB-1234 Make/Model: Honda City\nPeriod of Insurance: From 00:00 hrs on "
            + (today - timedelta(days=353)).isoformat()
            + " to Midnight of "
            + (today + timedelta(days=12)).isoformat(),
            "language": "en",
        }

    # 3. PUC Certificate (expires in 25 days)
    if "puc" in lower_fn:
        return {
            "doc_type": "PUC",
            "title": "Pollution Under Control Certificate",
            "fields": {
                "number": "DL01004820250012",
                "holder_name": "Aarav Sharma",
                "issue_date": (today - timedelta(days=160)).isoformat(),
                "expiry_date": (today + timedelta(days=25)).isoformat(),
                "issuer": "Government of NCT of Delhi (Transport Dept)",
                "extra": {"fuel_type": "Petrol", "emission_norms": "BS VI"},
            },
            "confidence": {
                "doc_type": 0.99,
                "number": 0.95,
                "holder_name": 0.88,
                "issue_date": 0.93,
                "expiry_date": 0.98,
            },
            "raw_text": "GOVERNMENT OF NCT OF DELHI - TRANSPORT DEPARTMENT\nPollution Under Control Certificate\nCertificate No: DL01004820250012\nVehicle Reg No: DL-01-AB-1234\nDate of Testing: "
            + (today - timedelta(days=160)).isoformat()
            + "\nValid Until: "
            + (today + timedelta(days=25)).isoformat()
            + "\nResult: PASS",
            "language": "en",
        }

    # 4. RC (Registration Certificate)
    if "rc" in lower_fn:
        return {
            "doc_type": "RC",
            "title": "Certificate of Vehicle Registration (RC)",
            "fields": {
                "number": "DL-01-AB-1234",
                "holder_name": "Aarav Sharma",
                "issue_date": "2021-04-15",
                "expiry_date": "2036-04-14",
                "issuer": "Mall Road RTO, Delhi",
                "extra": {"engine_no": "L15Z1982736", "chassis_no": "MA3GD81AS00912384"},
            },
            "confidence": {
                "doc_type": 0.97,
                "number": 0.99,
                "holder_name": 0.95,
                "issue_date": 0.92,
                "expiry_date": 0.91,
            },
            "raw_text": "UNION OF INDIA - REGISTRATION CERTIFICATE\nReg No: DL-01-AB-1234\nOwner: Aarav Sharma\nVehicle Class: Motor Car (LMV)\nDate of Reg: 2021-04-15  Valid Upto: 2036-04-14\nRTO: Mall Road Delhi",
            "language": "en",
        }

    # 5. Electricity Bill (Property utility proof)
    if "electricity" in lower_fn or "power" in lower_fn or "bill" in lower_fn:
        return {
            "doc_type": "Electricity Bill",
            "title": "BSES Rajdhani Electricity Bill",
            "fields": {
                "number": "CA-102938475",
                "holder_name": "Aarav Sharma",
                "issue_date": (today - timedelta(days=10)).isoformat(),
                "expiry_date": None,
                "issuer": "BSES Rajdhani Power Limited",
                "extra": {"address": "Flat 302, Palm Heights, Saket, New Delhi", "units_consumed": "342 kWh"},
            },
            "confidence": {
                "doc_type": 0.96,
                "number": 0.94,
                "holder_name": 0.91,
                "issue_date": 0.89,
                "expiry_date": 0.0,
            },
            "raw_text": "BSES RAJDHANI POWER LIMITED\nElectricity Bill for Cycle "
            + today.strftime("%b %Y")
            + "\nCA Number: 102938475\nConsumer: Aarav Sharma\nPremises: Flat 302, Palm Heights, Saket, New Delhi 110017\nBill Date: "
            + (today - timedelta(days=10)).isoformat(),
            "language": "en",
        }

    # 6. Rent Agreement
    if "rent" in lower_fn or "lease" in lower_fn or "tenancy" in lower_fn:
        return {
            "doc_type": "Rent Agreement",
            "title": "Residential Tenancy Agreement",
            "fields": {
                "number": "LEASE/DEL/2024/0912",
                "holder_name": "Aarav Sharma",
                "issue_date": (today - timedelta(days=180)).isoformat(),
                "expiry_date": (today + timedelta(days=185)).isoformat(),
                "issuer": "Sub-Registrar Office Mehrauli",
                "extra": {"monthly_rent": "₹ 38,000", "security_deposit": "₹ 76,000"},
            },
            "confidence": {
                "doc_type": 0.93,
                "number": 0.88,
                "holder_name": 0.90,
                "issue_date": 0.87,
                "expiry_date": 0.89,
            },
            "raw_text": "RESIDENTIAL RENT AGREEMENT\nBetween Mr. Vikram Mehta (Landlord) and Mr. Aarav Sharma (Tenant)\nProperty: Flat 302, Palm Heights, Saket, New Delhi\nTenure: 11 Months commencing from "
            + (today - timedelta(days=180)).isoformat()
            + " to "
            + (today + timedelta(days=185)).isoformat(),
            "language": "en",
        }

    # 7. Aadhaar Card
    if "aadhaar" in lower_fn or "aadhar" in lower_fn or "uidai" in lower_fn:
        return {
            "doc_type": "Aadhaar",
            "title": "Government of India - Aadhaar Card",
            "fields": {
                "number": "XXXX-XXXX-4819",
                "holder_name": "Aarav Sharma",
                "issue_date": "2016-08-12",
                "expiry_date": None,
                "issuer": "Unique Identification Authority of India (UIDAI)",
                "extra": {"dob": "1992-05-18", "gender": "Male"},
            },
            "confidence": {
                "doc_type": 0.99,
                "number": 0.97,
                "holder_name": 0.98,
                "issue_date": 0.82,
                "expiry_date": 0.0,
            },
            "raw_text": "भारत सरकार | GOVERNMENT OF INDIA\nभारतीय विशिष्ट पहचान प्राधिकरण (UIDAI)\nनामांकन क्रम: 2016/4819/001\nनाम: Aarav Sharma\nजन्म तिथि / DOB: 18/05/1992\nलिंग / Gender: पुरुष / Male\nआधार क्रमांक: XXXX XXXX 4819",
            "language": "mixed",
        }

    # 8. PAN Card
    if "pan" in lower_fn:
        return {
            "doc_type": "PAN",
            "title": "Income Tax Department - Permanent Account Number",
            "fields": {
                "number": "ABCPS1234K",
                "holder_name": "Aarav Sharma",
                "issue_date": "2018-03-22",
                "expiry_date": None,
                "issuer": "Income Tax Department, Govt of India",
                "extra": {"fathers_name": "Suresh Sharma"},
            },
            "confidence": {
                "doc_type": 0.99,
                "number": 0.98,
                "holder_name": 0.97,
                "issue_date": 0.75,
                "expiry_date": 0.0,
            },
            "raw_text": "INCOME TAX DEPARTMENT - GOVT. OF INDIA\nPermanent Account Number Card\nABCPS1234K\nName: AARAV SHARMA\nFather's Name: SURESH SHARMA\nDate of Birth: 18/05/1992",
            "language": "en",
        }

    # 9. Property Registry / Sale Deed
    if "registry" in lower_fn or "sale_deed" in lower_fn or "deed" in lower_fn:
        return {
            "doc_type": "Registry",
            "title": "Registered Sale Deed - Flat 302",
            "fields": {
                "number": "REG/SD/2020/4482",
                "holder_name": "Aarav Sharma",
                "issue_date": "2020-11-19",
                "expiry_date": None,
                "issuer": "Office of Sub-Registrar VII, Delhi",
                "extra": {"property_desc": "Flat 302, Palm Heights, Saket, New Delhi", "super_area": "1,450 sq ft"},
            },
            "confidence": {
                "doc_type": 0.95,
                "number": 0.92,
                "holder_name": 0.94,
                "issue_date": 0.93,
                "expiry_date": 0.0,
            },
            "raw_text": "DEED OF SALE\nExecuted on 19th November 2020\nPurchaser: Aarav Sharma S/o Suresh Sharma\nProperty Details: Flat No. 302, Third Floor, Palm Heights, Saket, New Delhi 110017\nRegistration Volume: 4482, Book 1",
            "language": "en",
        }

    # 10. Health Insurance
    if "health" in lower_fn or "mediclaim" in lower_fn:
        return {
            "doc_type": "Health Insurance",
            "title": "Star Health Family Optima Policy",
            "fields": {
                "number": "P/120000/01/2025/004921",
                "holder_name": "Aarav Sharma",
                "issue_date": (today - timedelta(days=320)).isoformat(),
                "expiry_date": (today + timedelta(days=45)).isoformat(),
                "issuer": "Star Health & Allied Insurance Co.",
                "extra": {"sum_insured": "₹ 15,00,000", "covered_members": "Aarav Sharma, Priya Sharma"},
            },
            "confidence": {
                "doc_type": 0.96,
                "number": 0.94,
                "holder_name": 0.93,
                "issue_date": 0.90,
                "expiry_date": 0.95,
            },
            "raw_text": "STAR HEALTH AND ALLIED INSURANCE COMPANY LIMITED\nPolicy Schedule - Family Optima Insurance Plan\nPolicy No: P/120000/01/2025/004921\nProposer: Aarav Sharma\nValid From: "
            + (today - timedelta(days=320)).isoformat()
            + " to "
            + (today + timedelta(days=45)).isoformat()
            + "\nSum Insured: INR 15,00,000",
            "language": "en",
        }

    # 11. Driving License
    if "driving" in lower_fn or "license" in lower_fn or "dl" in lower_fn:
        return {
            "doc_type": "Driving License",
            "title": "Government of NCT of Delhi - Driving Licence",
            "fields": {
                "number": "DL-0420110092834",
                "holder_name": "Aarav Sharma",
                "issue_date": "2015-06-10",
                "expiry_date": "2035-06-09",
                "issuer": "Transport Dept, Delhi",
                "extra": {"cov": "MCWG, LMV", "blood_group": "B+"},
            },
            "confidence": {
                "doc_type": 0.98,
                "number": 0.96,
                "holder_name": 0.95,
                "issue_date": 0.91,
                "expiry_date": 0.93,
            },
            "raw_text": "UNION OF INDIA - DRIVING LICENCE\nLicence No: DL-0420110092834\nName: Aarav Sharma\nDate of Birth: 18/05/1992\nValid Till: 2035-06-09\nAuth to Drive: MCWG, LMV",
            "language": "en",
        }

    # 12. Property Tax Receipt
    if "property_tax" in lower_fn or "tax_receipt" in lower_fn or ("tax" in lower_fn and "income" not in lower_fn):
        return {
            "doc_type": "Property Tax Receipt",
            "title": "MCD Property Tax Receipt 2024-25",
            "fields": {
                "number": "PT-2024-009182",
                "holder_name": "Aarav Sharma",
                "issue_date": (today - timedelta(days=405)).isoformat(),
                "expiry_date": (today - timedelta(days=40)).isoformat(),
                "issuer": "Municipal Corporation of Delhi",
                "extra": {"property_id": "DEL-SKT-302", "assessment_year": "2024-25"},
            },
            "confidence": {
                "doc_type": 0.95,
                "number": 0.93,
                "holder_name": 0.91,
                "issue_date": 0.88,
                "expiry_date": 0.92,
            },
            "raw_text": "MUNICIPAL CORPORATION OF DELHI - PROPERTY TAX DEPARTMENT\nReceipt No: PT-2024-009182\nOwner: Aarav Sharma\nProperty: Flat 302, Palm Heights, Saket, New Delhi\nAssessment Year: 2024-2025\nStatus: Paid (Validity expired for new financial year)",
            "language": "en",
        }

    # 13. Passport
    if "passport" in lower_fn:
        return {
            "doc_type": "Passport",
            "title": "Republic of India - Passport",
            "fields": {
                "number": "Z8192841",
                "holder_name": "Aarav Sharma",
                "issue_date": "2019-02-14",
                "expiry_date": "2029-02-13",
                "issuer": "Passport Seva Kendra Delhi",
                "extra": {"place_of_issue": "Delhi", "nationality": "INDIAN"},
            },
            "confidence": {
                "doc_type": 0.99,
                "number": 0.97,
                "holder_name": 0.98,
                "issue_date": 0.94,
                "expiry_date": 0.96,
            },
            "raw_text": "REPUBLIC OF INDIA - PASSPORT\nType: P  Country Code: IND  Passport No: Z8192841\nGiven Name: AARAV\nSurname: SHARMA\nNationality: INDIAN\nDate of Expiry: 13/02/2029",
            "language": "en",
        }

    # 14. Fallback: Unrecognized or General Document (Low confidence)
    return {
        "doc_type": "Other",
        "title": "Scanned Document",
        "fields": {
            "number": None,
            "holder_name": None,
            "issue_date": None,
            "expiry_date": None,
            "issuer": None,
            "extra": {},
        },
        "confidence": {
            "doc_type": 0.35,
            "number": 0.20,
            "holder_name": 0.25,
            "issue_date": 0.0,
            "expiry_date": 0.0,
        },
        "raw_text": f"Scanned file contents for {filename}. Unable to determine specific document type with high certainty.",
        "language": "en",
    }
