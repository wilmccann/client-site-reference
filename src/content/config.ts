import { defineCollection, z } from 'astro:content';

const work = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    image: z.string().optional(),
    order: z.number().default(0),
  }),
});

// Single-entry text for the portfolio page (src/content/pages/portfolio.yml).
// Keep in step with the "pages" collection in public/admin/config.yml.
const pages = defineCollection({
  type: 'data',
  schema: z.object({
    name: z.string(),
    greeting: z.string(),
    intro: z.string(),
    portrait: z.string().nullish(),
    portrait_alt: z.string().nullish(),
    about: z.string(),
    email: z.string(),
  }),
});

export const collections = { work, pages };
