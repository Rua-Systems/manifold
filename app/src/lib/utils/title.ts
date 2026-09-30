/** Builds a document title of the form `<section> · <organization>`, or just the organization. */
export function pageTitle(organizationName: string, section = ''): string {
	if (section.length === 0) {
		return organizationName;
	}
	return `${section} · ${organizationName}`;
}
