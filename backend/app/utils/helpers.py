"""
utils/helpers.py – Miscellaneous helper functions.
"""

from bson import ObjectId


def mongo_doc_to_dict(doc: dict) -> dict:
    """Convert MongoDB document _id (ObjectId) to string 'id'."""
    if doc and "_id" in doc:
        doc["id"] = str(doc.pop("_id"))
    return doc


def str_to_object_id(id_str: str) -> ObjectId:
    """Convert a string to ObjectId, raising ValueError on invalid input."""
    try:
        return ObjectId(id_str)
    except Exception:
        raise ValueError(f"Invalid ObjectId: {id_str}")
