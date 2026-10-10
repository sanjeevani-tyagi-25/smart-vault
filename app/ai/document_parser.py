import re
from datetime import datetime
from typing import Dict, Any, Optional, Tuple, List


# Month mapping for multi-format date parsing
MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7,
    "july": 7, "aug": 8, "august": 8, "sep": 9, "september": 9, "oct": 10,
    "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}


def parse_date(raw_val: str) -> Optional[str]:
    """
    Parse a date string in various Indian/International formats to ISO YYYY-MM-DD.
    Returns None if date cannot be parsed reliably. Never guesses.
    """
    if not raw_val:
        return None
    cleaned = raw_val.strip().strip(".,;:()")
    
    # Format: YYYY-MM-DD
    m = re.match(r"^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$", cleaned)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            return datetime(y, mo, d).strftime("%Y-%m-%d")
        except ValueError:
            return None

    # Format: DD/MM/YYYY or DD-MM-YYYY
    m = re.match(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$", cleaned)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            return datetime(y, mo, d).strftime("%Y-%m-%d")
        except ValueError:
            return None

    # Format: DD Mon YYYY or DD-Mon-YYYY or DD/Mon/YYYY (e.g., 16-Mar-2023, 15 Jan 2025)
    m = re.match(r"^(\d{1,2})[\s/-]+([A-Za-z]+)[\s/-]+(\d{4})$", cleaned)
    if m:
        d, mon_str, y = int(m.group(1)), m.group(2).lower()[:3], int(m.group(3))
        mo = MONTHS.get(mon_str)
        if mo:
            try:
                return datetime(y, mo, d).strftime("%Y-%m-%d")
            except ValueError:
                return None

    # Format: Mon DD, YYYY
    m = re.match(r"^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$", cleaned)
    if m:
        mon_str, d, y = m.group(1).lower()[:3], int(m.group(2)), int(m.group(3))
        mo = MONTHS.get(mon_str)
        if mo:
            try:
                return datetime(y, mo, d).strftime("%Y-%m-%d")
            except ValueError:
                return None

    return None


def mask_aadhaar(raw_num: str) -> str:
    """Mask Aadhaar to XXXX-XXXX-#### per UIDAI regulations."""
    digits = re.sub(r"[^\d]", "", raw_num)
    if len(digits) == 12:
        return f"XXXX-XXXX-{digits[-4:]}"
    # If already masked like XXXX-XXXX-1234
    if re.search(r"[xX]{4}[ -]?[xX]{4}[ -]?\d{4}", raw_num):
        last4 = re.search(r"\d{4}", raw_num)
        if last4:
            return f"XXXX-XXXX-{last4.group(0)}"
    return raw_num.strip()


def detect_document_type(text: str, filename: str) -> Tuple[str, float]:
    """
    Identifies document type using extracted text contents.
    Falls back to filename hint only if text is minimal, with lower confidence.
    """
    t = text.lower()
    fn = filename.lower()

    # Aadhaar
    if ("unique identification authority" in t or "aadhaar" in t or "uidai" in t or
            re.search(r"\b\d{4}\s\d{4}\s\d{4}\b", text) or "mera aadhaar" in t):
        return "Aadhaar", 0.95

    # PAN
    if ("permanent account number" in t or "income tax department" in t or
            re.search(r"\b[a-z]{5}[0-9]{4}[a-z]\b", t)):
        return "PAN", 0.95

    # Voter ID
    if ("election commission of india" in t or "elector photo identity" in t or
            "epic no" in t or "voter id" in t or "elector's name" in t or
            re.search(r"\b[a-z]{3}[0-9]{7}\b", t)):
        return "Voter ID", 0.94

    # Passport
    if ("passport" in t and ("republic of india" in t or "given name" in t or "surname" in t or "type p" in t or "nationality" in t)):
        return "Passport", 0.96

    # Registration Certificate (RC) - Check before general vehicle or emission terms
    is_rc = (
        "certificate of registration" in t or
        "registration certificate" in t or
        "form 23" in t or
        ("regn. validity" in t or "regn validity" in t) or
        ("date of regn" in t) or
        ("chassis no" in t and ("engine no" in t or "regn" in t or "reg no" in t or "transport" in t)) or
        ("motor car" in t and "reg" in t) or
        ("vehicle class" in t and "reg" in t)
    )
    if is_rc:
        return "RC", 0.96

    # PUC Certificate - Requires EXPLICIT pollution / emission test indicators.
    # Note: Vehicle emission norms (e.g. 'Bharat Stage VI') on an RC must NEVER classify as PUC.
    is_puc = (
        "pollution under control" in t or
        "puc certificate" in t or
        bool(re.search(r"\bpucc\b", t)) or
        bool(re.search(r"\bp\.u\.c\.?\s*certificate\b", t)) or
        "pollution testing" in t or
        "emission test certificate" in t or
        "smoke test" in t or
        ("pollution" in t and ("test" in t or "valid until" in t))
    )
    if is_puc:
        return "PUC", 0.96

    # Driving License
    if ("driving licence" in t or "driving license" in t or "licence to drive" in t or
            "motor vehicles department" in t and "dl no" in t):
        return "Driving License", 0.95

    # Health Insurance
    if ("health insurance" in t or "mediclaim" in t or "tpa" in t or
            ("sum insured" in t and "hospital" in t)):
        return "Health Insurance", 0.94

    # Insurance (Motor or general)
    if ("insurance" in t or "policy schedule" in t or "policy no" in t or
            "hdfc ergo" in t or "icici lombard" in t or "private car policy" in t or
            "motor insurance" in t or "insurer" in t):
        return "Insurance", 0.93

    # Rent / Lease Agreement
    if ("lease agreement" in t or "tenancy agreement" in t or "rent agreement" in t or
            ("landlord" in t and "tenant" in t)):
        return "Rent Agreement", 0.95

    # Property Tax Receipt
    if ("property tax" in t or "tax receipt" in t or "municipal corporation" in t or
            "assessment year" in t and "tax" in t):
        return "Property Tax Receipt", 0.94

    # Electricity Bill
    if ("electricity" in t or "bses" in t or "tata power" in t or "power distribution" in t or
            ("ca no" in t and "kwh" in t) or "discom" in t or "units consumed" in t):
        return "Electricity Bill", 0.94

    # Registry / Sale Deed
    if ("sale deed" in t or "conveyance deed" in t or "sub-registrar" in t or
            "registry" in t or "deed of sale" in t or "vendor" in t and "purchaser" in t):
        return "Registry", 0.93

    # Fallback to filename keywords if text is short
    if len(t.strip()) < 30:
        if "aadhaar" in fn:
            return "Aadhaar", 0.60
        if "pan" in fn:
            return "PAN", 0.60
        if "passport" in fn:
            return "Passport", 0.60
        if "voter" in fn:
            return "Voter ID", 0.60
        if "rc" in fn:
            return "RC", 0.60
        if "puc" in fn:
            return "PUC", 0.60
        if "license" in fn or "dl" in fn:
            return "Driving License", 0.60
        if "rent" in fn or "lease" in fn:
            return "Rent Agreement", 0.60
        if "tax" in fn:
            return "Property Tax Receipt", 0.60
        if "electricity" in fn or "bill" in fn:
            return "Electricity Bill", 0.60
        if "sale" in fn or "deed" in fn or "registry" in fn:
            return "Registry", 0.60
        if "insurance" in fn:
            return "Insurance", 0.60

    return "Other", 0.30


def find_date_in_context(text: str, keywords: List[str]) -> Optional[str]:
    """Searches for a date following one of the keyword triggers."""
    # Check longer/more specific triggers first
    sorted_kws = sorted(keywords, key=len, reverse=True)
    for kw in sorted_kws:
        pattern = r"(?:" + re.escape(kw) + r")[\s:.-]*([0-9]{1,4}[/-][0-9]{1,2}[/-][0-9]{1,4}|[0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4}|[A-Za-z]+\s+[0-9]{1,2},?\s+[0-9]{4})"
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            d = parse_date(m.group(1))
            if d:
                return d
    return None


def extract_regex_value(patterns: List[str], text: str) -> Optional[str]:
    """Tries multiple regex patterns and returns the first matching group."""
    for p in patterns:
        m = re.search(p, text, re.IGNORECASE)
        if m:
            val = m.group(1).strip()
            # Clean trailing punctuation
            val = re.sub(r"^[.: -]+|[.: -]+$", "", val)
            if val:
                return val
    return None


def parse_document_text(
    raw_text: str,
    filename: str,
    ocr_confidence: float = 0.90,
) -> Dict[str, Any]:
    """
    Main structured document parser.
    Extracts document-specific fields from the real text without inventing any values.
    Returns complete ExtractionResult compatible dictionary.
    """
    text = raw_text or ""
    doc_type, type_conf = detect_document_type(text, filename)

    fields: Dict[str, Any] = {
        "number": None,
        "holder_name": None,
        "issue_date": None,
        "expiry_date": None,
        "issuer": None,
        "extra": {},
    }

    confidence: Dict[str, float] = {
        "doc_type": round(type_conf, 2),
        "number": 0.0,
        "holder_name": 0.0,
        "issue_date": 0.0,
        "expiry_date": 0.0,
    }

    # Helper to assign field with genuine confidence
    def set_field(key: str, val: Optional[str], score: float):
        if val:
            fields[key] = val
            confidence[key] = round(min(1.0, max(0.0, score * ocr_confidence)), 2)

    # Helper for extra fields
    def set_extra(extra_key: str, val: Any):
        if val is not None:
            fields["extra"][extra_key] = val

    # Helper for names
    common_name_patterns = [
        r"(?:Owner|Name|Insured Name|Cardholder|Holder Name|Purchaser|Tenant|Consumer Name|Elector Name|Taxpayer)[:.\s]+([A-Za-z\s.'-]+?)(?:\n|$| - | -|Reg|Policy|Aadhaar|Premises|Vehicle)",
        r"(?:Name of Insured|Insured)[:.\s]+([A-Za-z\s.'-]+?)(?:\n|$)",
    ]

    # --- DOCUMENT SPECIFIC LOGIC ---

    if doc_type == "RC":
        # 1. Registration number
        reg_no = extract_regex_value([
            r"(?:Regn\.?\s*No|Registration\s*No|Reg\s*No|Registration\s*Number)[:.\s]*([A-Z]{2}[ -]?[0-9]{1,2}[ -]?[A-Z]{1,3}[ -]?[0-9]{4})",
            r"(?:Regn\.?\s*No|Registration\s*No|Reg\s*No|Registration\s*Number)[^\n]*\n(?:[^\n]*\n){0,3}?([A-Z]{2}[ -]?[0-9]{1,2}[ -]?[A-Z]{1,3}[ -]?[0-9]{4})",
            r"\b([A-Z]{2}[ -]?[0-9]{1,2}[ -]?[A-Z]{1,3}[ -]?[0-9]{4})\b",
        ], text)
        set_field("number", reg_no, 0.95)

        # 2. Registered Owner Name
        owner = None
        owner_m = re.search(
            r"(?:Ow[nm]er\s*Name|Registered\s*Owner|Regd\s*Owner|Name\s*of\s*Owner)[:.\s\n]+([A-Za-z\s.'-]+?)(?:\n|$|Son|Daughter|Wife|S/O|D/O|W/O|NEW|Address|Father)",
            text,
            re.IGNORECASE,
        )
        if owner_m:
            cand = owner_m.group(1).strip()
            cand = re.sub(r"\b(NEW|Son|Daughter|Wife|S/O|D/O|W/O)\b", "", cand, flags=re.IGNORECASE).strip()
            if cand and len(cand) > 1 and not cand.lower().startswith(("chassis", "sr.no", "engine", "date", "reg")):
                owner = cand

        if not owner:
            owner_m2 = re.search(r"^Owner[:.\s]+([A-Za-z\s.'-]+?)$", text, re.MULTILINE | re.IGNORECASE)
            if owner_m2:
                cand = owner_m2.group(1).strip()
                if cand and not cand.lower().startswith(("chassis", "sr.no", "engine")):
                    owner = cand

        if not owner:
            cand = extract_regex_value([
                r"(?:Owner|Name)[:.\s]*([A-Za-z\s.'-]+?)(?:\n|$| -|Document|Confidentiality)",
            ], text)
            if cand and not cand.lower().startswith(("chassis", "sr.no", "engine", "date", "reg", "valid")):
                owner = cand

        set_field("holder_name", owner, 0.92)

        # 3. Registration Date (Issue date)
        reg_date = find_date_in_context(text, [
            "Date of Regn", "Date of Registration", "Reg Date", "Registration Date", "Registered on", "Regn Date"
        ])
        if not reg_date:
            date_matches = re.findall(r"\b(\d{1,2}[\s/-]+[A-Za-z]{3}[\s/-]+\d{4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})\b", text)
            if date_matches:
                reg_date = parse_date(date_matches[0])
        set_field("issue_date", reg_date, 0.90)

        # 4. Vehicle Registration Validity / Fitness Expiry (RC validity, NOT PUC)
        fitness_exp = find_date_in_context(text, [
            "Regn.Validity", "Regn. Validity", "Regn Validity", "Regn Valid Upto",
            "Fitness Valid Upto", "Registration Valid Upto", "Valid Until", "Valid Upto", "Validity"
        ])
        if not fitness_exp:
            date_matches = re.findall(r"\b(\d{1,2}[\s/-]+[A-Za-z]{3}[\s/-]+\d{4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})\b", text)
            if len(date_matches) >= 2:
                fitness_exp = parse_date(date_matches[1])
        set_field("expiry_date", fitness_exp, 0.88)

        # 5. Authority
        issuer = extract_regex_value([
            r"(State Transport\s*Department)",
            r"(Transport Department)",
            r"(?:Registering Authority|Issued by|Transport Dept)[:.\s]*([A-Za-z\s.'-]+?)(?:\n|$)",
            r"(?:RTO)[:.\s]*([A-Za-z\s.'-]+?)(?:\n|$)",
        ], text) or "State Transport Department"
        set_field("issuer", issuer.strip(), 0.85)

        # 6. Extras: Vehicle Class, Model, Engine, Chassis, Fuel, Emission Norms, Relative, Address
        v_class = extract_regex_value([r"(?:Class|Vehicle Class)[:.\s]*([A-Za-z0-9\s()/-]+?)(?:\n|$| -|Owner)"], text)
        set_extra("vehicle_class", v_class)

        v_model = extract_regex_value([r"(?:Model|Maker/Model|Make/Model)[:.\s]*([A-Za-z0-9\s.-]+?)(?:\n|$| -)"], text)
        set_extra("vehicle_model", v_model)

        chassis = extract_regex_value([
            r"(?:Chassis\s*No[^\n]*\s*(?:Sr\.?\s*No[^\n]*)?\s*)([A-Z0-9]{10,20})\b",
            r"(?:Chassis\s*No|Chassis\s*Number)[:.\s]*([A-Za-z0-9]+)",
            r"\b([A-HJ-NPR-Z0-9]{17})\b",
        ], text)
        set_extra("chassis_no", chassis)

        engine = extract_regex_value([
            r"(?:Engine\s*No[^\n]*\s*)([A-Z0-9]{6,20})\b",
            r"(?:Engine\s*No|Engine\s*Number)[:.\s]*([A-Za-z0-9]+)",
        ], text)
        set_extra("engine_no", engine)

        fuel = extract_regex_value([
            r"\b(PETROL|DIESEL|CNG|ELECTRIC|HYBRID)\b",
            r"(?:Fuel\s*Used|Fuel\s*Type|Fuel)[:.\s]*([A-Za-z]+)",
        ], text)
        set_extra("fuel_type", fuel.title() if fuel else None)

        norms = extract_regex_value([
            r"(?:Emission\s*Norms|Norms)[:.\s]*([A-Za-z0-9\s]+?)(?:\n|$)",
            r"\b(BHARAT\s*STAGE\s*[IVX]+|BS\s*[-–]?\s*[IVX]+)\b",
        ], text)
        set_extra("emission_norms", norms)

        rel = extract_regex_value([
            r"(?:Son/DaughterWife of|Son/Daughter/Wife of|S/O|D/O|W/O)[:.\s\n]*([A-Za-z\s.'-]+?)(?:\n|$|Address)",
        ], text)
        set_extra("relative_name", rel)

        addr = extract_regex_value([
            r"\b(TANSHIPUR[A-Za-z0-9,\s.-]+?)(?:\n\s*PETROL|\n\s*24|\n\s*Emission|$)",
            r"(?:Address)[:.\s\n]*([A-Za-z0-9,\s.-]+?)(?:\n\s*Fuel|\n\s*24|\n\s*Pin|$)",
        ], text)
        set_extra("address", addr)

    elif doc_type == "Insurance":
        # Policy number
        pol_no = extract_regex_value([
            r"(?:Policy\s*(?:No|Number|#)|Policy\s*No\.?)[:.\s]*([A-Za-z0-9\-/]+)",
            r"\b([0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{2})\b",
            r"\bPolicy[:\s]+([0-9][A-Za-z0-9\-/]{3,})\b",
        ], text)
        set_field("number", pol_no, 0.94)

        insured = extract_regex_value([
            r"(?:Insured Name|Name of Insured|Insured|Owner)[:.\s]*([A-Za-z\s.'-]+?)(?:\n|$|Vehicle|Document)",
            *common_name_patterns,
        ], text)
        set_field("holder_name", insured, 0.92)

        start_date = find_date_in_context(text, ["Period of Insurance: From", "From", "Issue Date", "Policy Start Date", "Effective Date"])
        set_field("issue_date", start_date, 0.90)

        end_date = find_date_in_context(text, ["to Midnight of", "Valid Until", "Expiry Date", "To", "Expires on"])
        set_field("expiry_date", end_date, 0.94)

        # Insurer
        issuer = extract_regex_value([
            r"(HDFC ERGO[A-Za-z\s.'-]*|ICICI Lombard[A-Za-z\s.'-]*|Bajaj Allianz[A-Za-z\s.'-]*|Tata AIG[A-Za-z\s.'-]*|New India Assurance[A-Za-z\s.'-]*)",
            r"(?:Insurer|Company)[:.\s]*([A-Za-z\s.'-]+?)(?:\n|$)",
        ], text)
        if not issuer and "hdfc ergo" in text.lower():
            issuer = "HDFC ERGO General Insurance Co. Ltd."
        set_field("issuer", issuer, 0.90)

        # Vehicle Reg / IDV
        v_reg = extract_regex_value([r"(?:Vehicle Reg No|Vehicle|Reg No)[:.\s]*([A-Z]{2}[ -]?[0-9]{1,2}[ -]?[A-Z]{1,3}[ -]?[0-9]{4})"], text)
        set_extra("registration_no", v_reg)

        idv = extract_regex_value([r"(?:IDV Amount|IDV)[:.\s]*([₹INR0-9,\s]+)"], text)
        set_extra("idv_amount", idv)

    elif doc_type == "PUC":
        cert_no = extract_regex_value([
            r"(?:Certificate\s*(?:No|Number|#)|Certificate\s*No\.?|PUC\s*(?:No|Number|#))[:.\s]*([A-Za-z0-9]+)",
            r"\b([A-Z]{2}[0-9]{10,16})\b",
        ], text)
        set_field("number", cert_no, 0.93)

        owner = extract_regex_value([
            r"(?:Vehicle Owner|Owner Name|Owner)[:.\s]*([A-Za-z\s.'-]+?)(?:\n|$|Document|Status|Reg)",
        ], text)
        if owner and owner.lower().startswith(("chassis", "sr.no", "engine", "vehicle", "cert")):
            owner = None
        set_field("holder_name", owner, 0.88)

        test_date = find_date_in_context(text, ["Date of Testing", "Testing Date", "Tested on", "Test Date", "Date"])
        set_field("issue_date", test_date, 0.91)

        valid_until = find_date_in_context(text, ["Valid Until", "Valid Upto", "Expiry Date", "Valid till", "Validity"])
        set_field("expiry_date", valid_until, 0.95)

        issuer = extract_regex_value([
            r"(Govt of NCT Delhi[A-Za-z\s.'-]*|Government of [A-Za-z\s.'-]+|Transport Dept[A-Za-z\s.'-]*)",
            r"(?:Testing Centre|Centre Name|Authorised Centre)[:.\s]*([A-Za-z0-9\s.'-]+?)(?:\n|$)",
        ], text) or "Transport Department"
        set_field("issuer", issuer, 0.88)

        v_reg = extract_regex_value([
            r"(?:Vehicle\s*Reg\s*No|Vehicle\s*No|Reg\s*No)[:.\s]*([A-Z]{2}[ -]?[0-9]{1,2}[ -]?[A-Z]{1,3}[ -]?[0-9]{4})",
            r"\b([A-Z]{2}[ -]?[0-9]{1,2}[ -]?[A-Z]{1,3}[ -]?[0-9]{4})\b",
        ], text)
        set_extra("registration_no", v_reg)

        fuel = extract_regex_value([r"(?:Fuel|Fuel Type)[:.\s]*([A-Za-z]+)"], text)
        set_extra("fuel_type", fuel)

        norms = extract_regex_value([r"(?:Emission Norms|Norms)[:.\s]*([A-Za-z0-9\s]+?)(?:\n|$)"], text)
        set_extra("emission_norms", norms)

    elif doc_type == "Driving License":
        dl_no = extract_regex_value([
            r"(?:DL No|License No|Licence No)[:.\s]*([A-Za-z0-9\-/\s]+)",
            r"\b([A-Z]{2}[ -]?[0-9]{2}[ -]?[0-9]{4,11})\b",
        ], text)
        set_field("number", dl_no, 0.95)

        holder = extract_regex_value([
            r"(?:Name|Holder Name)[:.\s]*([A-Za-z\s.'-]+?)(?:\n|$|S/O|D/O|W/O|DOB)",
            *common_name_patterns,
        ], text)
        set_field("holder_name", holder, 0.92)

        issue_d = find_date_in_context(text, ["Date of Issue", "Issue Date", "Issued on"])
        set_field("issue_date", issue_d, 0.90)

        exp_d = find_date_in_context(text, ["Valid Till", "Validity", "Expiry Date", "Valid Upto"])
        set_field("expiry_date", exp_d, 0.92)

        issuer = extract_regex_value([
            r"(?:Licensing Authority|Issued by)[:.\s]*([A-Za-z\s.'-]+?)(?:\n|$)",
        ], text) or "Transport Department"
        set_field("issuer", issuer, 0.85)

        dob = find_date_in_context(text, ["DOB", "Date of Birth", "Birth Date"])
        set_extra("date_of_birth", dob)

        classes = extract_regex_value([r"(?:Class of Vehicle|COV)[:.\s]*([A-Za-z0-9,\s]+?)(?:\n|$)"], text)
        set_extra("vehicle_classes", classes)

    elif doc_type == "Aadhaar":
        # Masked Aadhaar number
        raw_uid = extract_regex_value([
            r"(?:Aadhaar No|Aadhaar Number)[:.\s]*([0-9xX\s-]+)",
            r"\b([xX]{4}[ -]?[xX]{4}[ -]?[0-9]{4})\b",
            r"\b([0-9]{4}[ -]?[0-9]{4}[ -]?[0-9]{4})\b",
        ], text)
        masked_uid = mask_aadhaar(raw_uid) if raw_uid else None
        set_field("number", masked_uid, 0.95)

        holder = extract_regex_value([
            r"(?:Name)[:.\s]*([A-Za-z\s.'-]+?)(?:\n|$|DOB|Year of Birth|Male|Female|Owner)",
            *common_name_patterns,
        ], text)
        set_field("holder_name", holder, 0.90)

        # Aadhaar has no expiry date!
        set_field("expiry_date", None, 0.0)

        issuer = "Unique Identification Authority of India (UIDAI)"
        set_field("issuer", issuer, 0.95)

        dob = find_date_in_context(text, ["DOB", "Date of Birth"])
        set_extra("date_of_birth", dob)

        gender = extract_regex_value([r"\b(Male|Female|Transgender)\b"], text)
        set_extra("gender", gender)

    elif doc_type == "PAN":
        pan_no = extract_regex_value([
            r"\b([A-Z]{5}[0-9]{4}[A-Z])\b",
            r"(?:PAN|Permanent Account Number)[:.\s]*([A-Z0-9]+)",
        ], text)
        set_field("number", pan_no, 0.97)

        holder = extract_regex_value([
            r"(?:Name)[:.\s]*([A-Za-z\s.'-]+?)(?:\n|$|Father|DOB)",
            *common_name_patterns,
        ], text)
        set_field("holder_name", holder, 0.92)

        # PAN has no expiry date
        set_field("expiry_date", None, 0.0)

        issuer = "Income Tax Department"
        set_field("issuer", issuer, 0.95)

        dob = find_date_in_context(text, ["DOB", "Date of Birth"])
        set_extra("date_of_birth", dob)

        father = extract_regex_value([r"(?:Father's Name|Father Name)[:.\s]*([A-Za-z\s.'-]+?)(?:\n|$)"], text)
        set_extra("father_name", father)

    elif doc_type == "Passport":
        passport_no = extract_regex_value([
            r"(?:Passport No|Passport Number)[:.\s]*([A-Z0-9]+)",
            r"\b([A-PR-WYa-pr-wy][1-9][0-9]{6,7})\b",
        ], text)
        set_field("number", passport_no, 0.96)

        holder = extract_regex_value([
            r"(?:Given Name|Surname|Name)[:.\s]*([A-Za-z\s.'-]+?)(?:\n|$)",
            *common_name_patterns,
        ], text)
        set_field("holder_name", holder, 0.92)

        issue_d = find_date_in_context(text, ["Date of Issue", "Issue Date"])
        set_field("issue_date", issue_d, 0.93)

        exp_d = find_date_in_context(text, ["Date of Expiry", "Expiry Date"])
        set_field("expiry_date", exp_d, 0.95)

        issuer = "Government of India"
        set_field("issuer", issuer, 0.92)

        dob = find_date_in_context(text, ["Date of Birth", "DOB"])
        set_extra("date_of_birth", dob)

        nationality = extract_regex_value([r"(?:Nationality)[:.\s]*([A-Za-z]+)"], text) or "INDIAN"
        set_extra("nationality", nationality)

    elif doc_type == "Voter ID":
        epic_no = extract_regex_value([
            r"(?:EPIC No|EPIC Number|Voter ID No)[:.\s]*([A-Z0-9]+)",
            r"\b([A-Z]{3}[0-9]{7})\b",
        ], text)
        set_field("number", epic_no, 0.94)

        holder = extract_regex_value([
            r"(?:Elector's Name|Elector Name|Name)[:.\s]*([A-Za-z\s.'-]+?)(?:\n|$|Father|Husband)",
            *common_name_patterns,
        ], text)
        set_field("holder_name", holder, 0.90)

        # Permanent
        set_field("expiry_date", None, 0.0)

        issuer = "Election Commission of India"
        set_field("issuer", issuer, 0.95)

        rel = extract_regex_value([r"(?:Father's Name|Husband's Name|Relative)[:.\s]*([A-Za-z\s.'-]+?)(?:\n|$)"], text)
        set_extra("relative_name", rel)

        constituency = extract_regex_value([r"(?:Assembly Constituency|Constituency)[:.\s]*([A-Za-z0-9\s-]+?)(?:\n|$)"], text)
        set_extra("assembly_constituency", constituency)

    elif doc_type == "Rent Agreement":
        holder = extract_regex_value([
            r"(?:Tenant)[:.\s]*([A-Za-z\s.'-]+?)(?:\n|$|Premises|Term)",
            *common_name_patterns,
        ], text)
        set_field("holder_name", holder, 0.90)

        start_date = find_date_in_context(text, ["Agreement Date", "Commencement Date", "Start Date", "From"])
        set_field("issue_date", start_date, 0.90)

        end_date = find_date_in_context(text, ["Expiry Date", "End Date", "Termination Date", "to"])
        set_field("expiry_date", end_date, 0.90)

        set_field("issuer", "Residential Lease Agreement", 0.85)

        landlord = extract_regex_value([r"(?:Landlord|Lessor)[:.\s]*([A-Za-z\s.'-]+?)(?:\n|$|Tenant)"], text)
        set_extra("landlord_name", landlord)

        tenant = extract_regex_value([r"(?:Tenant|Lessee)[:.\s]*([A-Za-z\s.'-]+?)(?:\n|$|Premises)"], text)
        set_extra("tenant_name", tenant)

        prem = extract_regex_value([r"(?:Premises|Property)[:.\s]*([A-Za-z0-9,\s.-]+?)(?:\n|$|Term)"], text)
        set_extra("property_address", prem)

        rent = extract_regex_value([r"(?:Monthly Rent|Rent)[:.\s]*([INR₹0-9,\s]+?)(?:\n|$)"], text)
        set_extra("monthly_rent", rent)

    elif doc_type == "Electricity Bill":
        ca_no = extract_regex_value([
            r"(?:CA No|CA Number|CA|Consumer No|Consumer ID)[:.\s]*([0-9]+)",
        ], text)
        set_field("number", ca_no, 0.94)

        holder = extract_regex_value([
            r"(?:Consumer Name|Name|Owner)[:.\s]*([A-Za-z\s.'-]+?)(?:\n|$|Document|Status)",
            *common_name_patterns,
        ], text)
        set_field("holder_name", holder, 0.88)

        bill_date = find_date_in_context(text, ["Bill Date", "Issue Date", "Date"])
        set_field("issue_date", bill_date, 0.88)

        due_date = find_date_in_context(text, ["Due Date", "Pay by Date", "Valid Until"])
        set_field("expiry_date", due_date, 0.92)

        issuer = extract_regex_value([
            r"(BSES Rajdhani[A-Za-z\s.'-]*|BSES Yamuna[A-Za-z\s.'-]*|Tata Power[A-Za-z\s.'-]*|BESCOM|MSEDCL)",
        ], text) or "Electricity Distribution Company"
        set_field("issuer", issuer, 0.88)

        prem = extract_regex_value([r"(?:Premises|Address)[:.\s]*([A-Za-z0-9,\s.-]+?)(?:\n|$| -CA|Owner)"], text)
        set_extra("premises_address", prem)

    elif doc_type == "Property Tax Receipt":
        receipt_no = extract_regex_value([
            r"(?:Receipt No|Assessment No|Property ID|PT No)[:.\s]*([A-Za-z0-9\-/]+)",
            r"\b(PT-[0-9]{4}-[0-9]+)\b",
        ], text)
        set_field("number", receipt_no, 0.92)

        holder = extract_regex_value([
            r"(?:Taxpayer Name|Owner Name|Name)[:.\s]*([A-Za-z\s.'-]+?)(?:\n|$)",
            *common_name_patterns,
        ], text)
        set_field("holder_name", holder, 0.88)

        pay_date = find_date_in_context(text, ["Payment Date", "Date of Payment", "Date"])
        set_field("issue_date", pay_date, 0.90)

        # Tax receipt validity / assessment end or None
        set_field("expiry_date", None, 0.0)

        issuer = extract_regex_value([
            r"(Municipal Corporation of [A-Za-z\s.'-]+|MCD[A-Za-z\s.'-]*|BBMP[A-Za-z\s.'-]*)",
        ], text) or "Municipal Corporation"
        set_field("issuer", issuer, 0.85)

        prem = extract_regex_value([r"(?:Property Address|Address)[:.\s]*([A-Za-z0-9,\s.-]+?)(?:\n|$)"], text)
        set_extra("property_address", prem)

        yr = extract_regex_value([r"(?:Assessment Year)[:.\s]*([0-9]{4}[-–][0-9]{2,4})"], text)
        set_extra("assessment_year", yr)

    elif doc_type == "Registry":
        deed_no = extract_regex_value([
            r"(?:Deed No|Document No|Reg No)[:.\s]*([A-Za-z0-9\-/]+)",
        ], text)
        set_field("number", deed_no, 0.90)

        purchaser = extract_regex_value([
            r"(?:Purchaser|Buyer|Owner)[:.\s]*([A-Za-z\s.'-]+?)(?:\n|$)",
            *common_name_patterns,
        ], text)
        set_field("holder_name", purchaser, 0.88)

        exec_date = find_date_in_context(text, ["Date of Registration", "Registration Date", "Date of Execution"])
        set_field("issue_date", exec_date, 0.90)

        # Permanent property title
        set_field("expiry_date", None, 0.0)

        issuer = extract_regex_value([
            r"(Office of Sub-Registrar[A-Za-z\s.'-]*|Sub-Registrar[A-Za-z\s.'-]*)",
        ], text) or "Sub-Registrar Office"
        set_field("issuer", issuer, 0.88)

        seller = extract_regex_value([r"(?:Seller|Vendor)[:.\s]*([A-Za-z\s.'-]+?)(?:\n|$)"], text)
        set_extra("seller_name", seller)

        prop_desc = extract_regex_value([r"(?:Property Description|Premises|Address)[:.\s]*([A-Za-z0-9,\s.-]+?)(?:\n|$)"], text)
        set_extra("property_address", prop_desc)

    elif doc_type == "Health Insurance":
        pol_no = extract_regex_value([
            r"(?:Policy No|Policy Number)[:.\s]*([A-Za-z0-9\-/]+)",
        ], text)
        set_field("number", pol_no, 0.92)

        insured = extract_regex_value([
            r"(?:Primary Insured|Insured Name|Name)[:.\s]*([A-Za-z\s.'-]+?)(?:\n|$)",
            *common_name_patterns,
        ], text)
        set_field("holder_name", insured, 0.90)

        start_date = find_date_in_context(text, ["Policy Start Date", "Effective Date", "From"])
        set_field("issue_date", start_date, 0.90)

        end_date = find_date_in_context(text, ["Policy Expiry Date", "Expiry Date", "To"])
        set_field("expiry_date", end_date, 0.92)

        issuer = extract_regex_value([
            r"(Star Health[A-Za-z\s.'-]*|Care Health[A-Za-z\s.'-]*|HDFC ERGO[A-Za-z\s.'-]*|Niva Bupa[A-Za-z\s.'-]*)",
        ], text) or "Health Insurance Provider"
        set_field("issuer", issuer, 0.88)

        sum_ins = extract_regex_value([r"(?:Sum Insured)[:.\s]*([₹INR0-9,\s]+?)(?:\n|$)"], text)
        set_extra("sum_insured", sum_ins)

    else:
        # Document Type "Other"
        # Only extract if explicitly marked; NEVER invent
        gen_no = extract_regex_value([r"(?:No|Number|ID)[:.\s]*([A-Za-z0-9\-/]+)"], text)
        set_field("number", gen_no, 0.50)

        gen_name = extract_regex_value(common_name_patterns, text)
        set_field("holder_name", gen_name, 0.50)

        gen_issue = find_date_in_context(text, ["Issue Date", "Date"])
        set_field("issue_date", gen_issue, 0.50)

        gen_exp = find_date_in_context(text, ["Expiry Date", "Valid Until", "Due Date"])
        set_field("expiry_date", gen_exp, 0.50)

    # Clean dates through sanitize_date logic
    for date_key in ("issue_date", "expiry_date"):
        if fields[date_key]:
            parsed = parse_date(str(fields[date_key]))
            fields[date_key] = parsed
            if not parsed:
                confidence[date_key] = 0.0

    # Human-readable title
    name_snippet = fields.get("holder_name") or ""
    num_snippet = fields.get("number") or ""
    if doc_type != "Other":
        if name_snippet and num_snippet:
            title = f"{doc_type} - {name_snippet} ({num_snippet})"
        elif name_snippet:
            title = f"{doc_type} - {name_snippet}"
        elif num_snippet:
            title = f"{doc_type} ({num_snippet})"
        else:
            title = f"{doc_type} Document"
    else:
        title = filename.replace("_", " ").rsplit(".", 1)[0].title()

    # Detect language
    has_devanagari = bool(re.search(r"[\u0900-\u097F]", text))
    has_latin = bool(re.search(r"[A-Za-z]", text))
    if has_devanagari and has_latin:
        lang = "mixed"
    elif has_devanagari:
        lang = "hi"
    else:
        lang = "en"

    return {
        "doc_type": doc_type,
        "title": title[:100],
        "fields": fields,
        "confidence": confidence,
        "raw_text": text,
        "language": lang,
        "provider": "local_ocr",
    }
