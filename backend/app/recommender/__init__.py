"""Recommendation algorithms: content-based (TF-IDF), weighted preference scoring,
item-based collaborative filtering and the hybrid engine that combines them."""

from .collaborative import ItemKNN
from .content import ContentIndex
from .engine import Recommender, course_summary

__all__ = ["ContentIndex", "ItemKNN", "Recommender", "course_summary"]
