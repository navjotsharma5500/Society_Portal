const IMPORT_STATUSES = Object.freeze({
  PREVIEWED: "PREVIEWED",
  IMPORTED: "IMPORTED",
  EXPIRED: "EXPIRED",
  FAILED: "FAILED",
});

const ENTITY_TYPES = Object.freeze({
  SOCIETY: "SOCIETY",
  CLUB: "CLUB",
  STUDENT_CHAPTER: "STUDENT_CHAPTER",
  CELL: "CELL",
  SOCIETY_OR_CLUB: "SOCIETY_OR_CLUB",
});

const CAMPUSES = Object.freeze({ PATIALA: "PATIALA", DERA_BASSI: "DERA_BASSI" });

const CATEGORY_BY_ENTITY_TYPE = Object.freeze({
  SOCIETY: "Society",
  CLUB: "Club",
  STUDENT_CHAPTER: "Student Chapter",
  CELL: "Cell",
  SOCIETY_OR_CLUB: "Society/Club",
});

const SECTION_MAPPINGS = Object.freeze([
  { heading: "societies tiet", entityType: ENTITY_TYPES.SOCIETY, campus: CAMPUSES.PATIALA },
  { heading: "clubs tiet", entityType: ENTITY_TYPES.CLUB, campus: CAMPUSES.PATIALA },
  { heading: "chapter tiet", entityType: ENTITY_TYPES.STUDENT_CHAPTER, campus: CAMPUSES.PATIALA },
  { heading: "cell", entityType: ENTITY_TYPES.CELL, campus: CAMPUSES.PATIALA },
  { heading: "societies clubs student chapters dera bassi", entityType: ENTITY_TYPES.SOCIETY_OR_CLUB, campus: CAMPUSES.DERA_BASSI },
]);

module.exports = {
  IMPORT_STATUSES,
  ENTITY_TYPES,
  CAMPUSES,
  CATEGORY_BY_ENTITY_TYPE,
  SECTION_MAPPINGS,
};
