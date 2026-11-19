/**
 * Professor ratings source (spec section 10, Q7: OPEN).
 * Rate My Professors' terms don't allow scraping, so there is deliberately
 * no scraper here. For now the app shows past grade distributions instead
 * (lib/grade-history.ts, from public UCSB records). Plug a permitted
 * ratings source into this interface if one turns up.
 */
export interface RatingsProvider {
  getRating(instructor: string, courseId: string): Promise<number | null>;
}

export const noRatings: RatingsProvider = {
  async getRating() {
    return null;
  },
};
