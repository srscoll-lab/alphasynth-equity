import { useSyncExternalStore } from "react";
import { getReviewJobs, subscribeReviewJobs } from "./fundamental-review-activity";
export const useReviewJobs = () => useSyncExternalStore(subscribeReviewJobs, getReviewJobs, getReviewJobs);
