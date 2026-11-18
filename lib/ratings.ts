/**
 * Professor ratings source (spec section 10, Q7: OPEN).
 * Rate My Professors' terms don't allow scraping, so there is deliberately
 * no scraper here. Plug a permitted source into this interface later.
 */
export interface RatingsProvider {
  getRating(instructor: string, courseId: string): Promise<number | null>;
}

export const noRatings: RatingsProvider = {
  async getRating() {
    return null;
  },
};
