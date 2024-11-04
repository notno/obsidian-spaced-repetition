import { ReviewResponse } from "src/algorithms/base/repetition-item";
import { TICKS_PER_DAY } from "src/constants";
import { DueDateHistogram } from "src/due-date-histogram";
import { t } from "src/lang/helpers";
import { SRSettings } from "src/settings";

// Note that if dueDateHistogram is provided, then it is just used to assist with fuzzing.
// (Unlike earlier versions, it is not updated based on the calculated schedule. The
// caller needs to do that if needed.

export function osrSchedule(
    response: ReviewResponse,
    originalInterval: number,
    ease: number,
    delayedBeforeReview: number,
    settings: SRSettings,
    dueDateHistogram?: DueDateHistogram,
): Record<string, number> {
    const delayedBeforeReviewDays = Math.max(0, Math.floor(delayedBeforeReview / TICKS_PER_DAY));
    let interval: number = originalInterval;
    const forgotten: boolean = ease < 0;
    // If the card was previously forgotten (ease is negative), reset the ease.
    ease = Math.abs(ease);
    if (response === ReviewResponse.Easy) {
        ease += 20;
        interval = ((interval + delayedBeforeReviewDays) * ease) / 100;
        interval *= settings.easyBonus;
    } else if (response === ReviewResponse.Good) {
        interval = ((interval + delayedBeforeReviewDays / 2) * ease) / 100;
    } else if (response === ReviewResponse.Hard) {
        ease = Math.max(130, ease - 20);
        interval = Math.max(
            1,
            (interval + delayedBeforeReviewDays / 4) * settings.lapsesIntervalChange,
        );
    } else if (response === ReviewResponse.Forgotten) {
        // If the card was forgotten, decrease the ease and the interval
        ease = Math.max(130, ease - 40); // Decrease ease more than for 'Hard'
        ease = -ease; // This is to store the state of the card as forgotten
        // Minimum interval is 10 minutes
        interval = 10 / (24 * 60);
    }

    // If the card was previously forgotten, there is a penalty to the interval
    interval *= forgotten ? settings.lapsesIntervalChange : 1;

    // replaces random fuzz with load balancing over the fuzz interval
    if (settings.loadBalance && dueDateHistogram !== undefined) {
        // Don't round if less than a day
        interval = interval > 1 ? Math.round(interval) : interval;
        // disable fuzzing for small intervals
        if (interval > 7) {
            let fuzz: number;
            // 3 day window: day - 1 <= x <= day + 1
            if (interval <= 21) fuzz = 1;
            // up to a week window: day - 3 <= x <= day + 3
            else if (interval <= 180) fuzz = Math.min(3, Math.floor(interval * 0.05));
            // up to a 2 weeks window: day - 7 <= x <= day + 7
            else fuzz = Math.min(7, Math.floor(interval * 0.025));

            interval = dueDateHistogram.findLeastUsedIntervalOverRange(interval, fuzz);
        }
    }

    interval = Math.min(interval, settings.maximumInterval);
    // Round to 3 decimal places (e.g. 10 minutes = 0.0069 days). <-- This is a bit of a hack. Use minutes instead of days.
    interval = Math.round(interval * 1000) / 1000;

    return { interval, ease };
}

export function textInterval(interval: number, isMobile: boolean): string {
    if (interval === undefined) {
        return t("NEW");
    }

    const m: number = Math.round(interval / 3.04375) / 10,
        y: number = Math.round(interval / 36.525) / 10;

    if (isMobile) {
        if (m < 1.0) return t("DAYS_STR_IVL_MOBILE", { interval });
        else if (y < 1.0) return t("MONTHS_STR_IVL_MOBILE", { interval: m });
        else return t("YEARS_STR_IVL_MOBILE", { interval: y });
    } else {
        if (m < 1.0) return t("DAYS_STR_IVL", { interval });
        else if (y < 1.0) return t("MONTHS_STR_IVL", { interval: m });
        else return t("YEARS_STR_IVL", { interval: y });
    }
}
