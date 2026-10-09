from typing import List, Dict, Any, Set

REQUIRED_DOCUMENTS_CONFIG: Dict[str, List[Dict[str, Any]]] = {
    "vehicle": [
        {"doc_type": "RC", "optional": False, "label": "RC (Registration Certificate)"},
        {"doc_type": "Insurance", "optional": False, "label": "Vehicle Insurance Policy"},
        {"doc_type": "PUC", "optional": False, "label": "PUC Certificate"},
        {"doc_type": "Driving License", "optional": False, "label": "Driving License (Owner)"},
    ],
    "property": [
        {"doc_type": "Registry", "optional": False, "label": "Registry / Sale Deed"},
        {"doc_type": "Property Tax Receipt", "optional": False, "label": "Property Tax Receipt"},
        {"doc_type": "Electricity Bill", "optional": False, "label": "Electricity Bill"},
        {"doc_type": "Rent Agreement", "optional": True, "note": "if rented", "label": "Rent Agreement (Optional - if rented)"},
    ],
    "person": [
        {"doc_type": "Aadhaar", "optional": False, "label": "Aadhaar Card"},
        {"doc_type": "PAN", "optional": False, "label": "PAN Card"},
        {"doc_type": "Passport", "optional": True, "label": "Passport (Optional)"},
        {"doc_type": "Health Insurance", "optional": False, "label": "Health Insurance Policy"},
    ],
    "other": []
}

# Aliases for robust checklist matching
DOC_TYPE_ALIASES: Dict[str, Set[str]] = {
    "Registry": {"Registry", "Registry/Sale Deed", "Sale Deed", "Registered Sale Deed"},
    "Insurance": {"Insurance", "Vehicle Insurance"},
    "Health Insurance": {"Health Insurance", "Mediclaim"},
    "RC": {"RC", "Registration Certificate"},
    "PUC": {"PUC", "Pollution Certificate"},
    "Driving License": {"Driving License", "DL"},
}


def _check_presence(expected_type: str, present_types: Set[str]) -> bool:
    if expected_type in present_types:
        return True
    aliases = DOC_TYPE_ALIASES.get(expected_type, set())
    return any(a in present_types for a in aliases)


def get_checklist_for_asset(asset_type: str, present_doc_types: Set[str]) -> List[Dict[str, Any]]:
    """Returns full checklist of required/optional docs with presence flags."""
    schema = REQUIRED_DOCUMENTS_CONFIG.get(asset_type.lower(), [])
    checklist = []
    for item in schema:
        is_present = _check_presence(item["doc_type"], present_doc_types)
        checklist.append({
            "doc_type": item["doc_type"],
            "label": item["label"],
            "optional": item.get("optional", False),
            "note": item.get("note", None),
            "present": is_present,
        })
    return checklist


def get_missing_for_asset(asset_type: str, present_doc_types: Set[str], include_optional: bool = False) -> List[Dict[str, Any]]:
    """Returns missing documents (required types minus doc_types present)."""
    checklist = get_checklist_for_asset(asset_type, present_doc_types)
    missing = []
    for item in checklist:
        if not item["present"]:
            if include_optional or not item["optional"]:
                missing.append(item)
    return missing
