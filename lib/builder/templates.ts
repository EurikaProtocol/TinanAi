export const projectTemplates = {
  business: {
    name: 'Business website',
    prompt: 'Build a responsive business website that clearly presents a company, its services, and an accessible way to get in touch.',
  },
  services: {
    name: 'Services website',
    prompt: 'Build a clear services website that explains the offer, shows who it helps, and guides visitors toward a contact action.',
  },
  ecommerce: {
    name: 'E-commerce store',
    prompt: 'Build a responsive e-commerce storefront with a browsable product catalog, clear product details, and an accessible shopping flow.',
  },
  saas: {
    name: 'SaaS landing page',
    prompt: 'Build a SaaS landing page that explains the product, highlights its benefits, and includes a clear call to action.',
  },
  dashboard: {
    name: 'Product dashboard',
    prompt: 'Build a product dashboard with a clear overview, useful data summaries, and an organized workflow interface.',
  },
} as const;

export type ProjectTemplateId = keyof typeof projectTemplates;

export function getProjectTemplate(templateId: string) {
  return Object.prototype.hasOwnProperty.call(projectTemplates, templateId)
    ? projectTemplates[templateId as ProjectTemplateId]
    : undefined;
}
