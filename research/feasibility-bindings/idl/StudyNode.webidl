[Exposed=Window]
interface StudyNode {
  readonly attribute DOMString nodeName;
  attribute DOMString textContent;
  readonly attribute StudyNode? parentNode;
  StudyNode appendChild(StudyNode node);
};
