import { EventHint, Integration } from '@sentry/types';
import { resolvedSyncPromise } from '@sentry/utils';

import { NATIVE } from '../wrapper';

/** Adds screenshots to error events */
export class Screenshot implements Integration {
    /**
   * @inheritDoc
   */
    public static id: string = 'Screenshot';

    /**
   * @inheritDoc
   */
    public name: string = Screenshot.id;

    /**
   * If enabled attaches a screenshot to the event hint.
   */
    public static  attachScreenshotToEventHint(
        hint: EventHint,
        { attachScreenshot }: { attachScreenshot?: boolean },
    ): EventHint {
        if (!attachScreenshot) {
            return (hint);
        }

        const  screenshots = NATIVE.captureScreenshot();
        if (screenshots !== null && screenshots.length > 0) {
            hint.attachments = [
                ...screenshots,
                ...(hint?.attachments || []),
            ];
        }
        return hint;
    }

    /**
   * @inheritDoc
   */
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    public setupOnce(): void {}
}
