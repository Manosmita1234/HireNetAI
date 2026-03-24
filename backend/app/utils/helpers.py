"""
utils/helpers.py – Miscellaneous helper functions used across routers and services.

Currently provides two small utilities for working with MongoDB's document IDs.

Background on MongoDB's ObjectId:
  - Every MongoDB document has a special field "_id" (note the underscore prefix)
  - Its type is ObjectId — a 12-byte binary value, not a plain string
  - When we send data to the frontend (as JSON), we must convert it to a string first
    because JSON doesn't have an ObjectId type
  - Conversely, when we receive an ID from the frontend (as a URL param like /session/abc123),
    we must convert it back to ObjectId before querying MongoDB
"""

from bson import ObjectId  # bson is the Binary JSON library used by MongoDB drivers


def mongo_doc_to_dict(doc: dict) -> dict:
    """
    Converts a raw MongoDB document into a Python dict safe for JSON serialization.

    Problem: MongoDB documents have "_id": ObjectId("507f1f77...") which can't be
    serialized to JSON as-is.

    Solution: rename "_id" → "id" and convert the ObjectId to a plain string.

    Example:
        Before: { "_id": ObjectId("507f1f77bcf86cd799439011"), "name": "Alice" }
        After:  { "id": "507f1f77bcf86cd799439011", "name": "Alice" }

    Note: doc.pop("_id") removes the "_id" key AND returns its value in one step.
    """
    if doc and "_id" in doc:
        doc["id"] = str(doc.pop("_id"))  # pop removes "_id", str() converts ObjectId → string
    return doc


def str_to_object_id(id_str: str) -> ObjectId:
    """
    Converts a plain string ID (from a URL or request body) to a MongoDB ObjectId.

    This is needed before querying MongoDB, e.g.:
        collection.find_one({"_id": str_to_object_id(session_id)})

    Raises ValueError with a clear message if id_str is not a valid 24-char hex string.
    (Prevents confusing MongoDB errors from propagating to the user.)
    """
    try:
        return ObjectId(id_str)
    except Exception:
        raise ValueError(f"Invalid ObjectId: {id_str}")
