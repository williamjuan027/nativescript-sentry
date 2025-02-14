import { addEventProcessor, addGlobalEventProcessor, getCurrentHub } from '@sentry/core';
import { Event, EventHint, Integration, StackFrame, StackLineParser } from '@sentry/types';
import { logger, stackParserFromStackParserOptions } from '@sentry/utils';

// const INTERNAL_CALLSITES_REGEX = new RegExp(['/Libraries/Renderer/oss/NativescriptRenderer-dev\\.js$', '/Libraries/BatchedBridge/MessageQueue\\.js$'].join('|'));

/**
 * React Native Stack Frame
 */
interface NativescriptFrame {
    // arguments: []
    column: number;
    file: string;
    lineNumber: number;
    methodName: string;
}

/**
 * React Native Error
 */
type NativescriptError = Error & {
    stackTrace?: string;
    framesToPop?: number;
    jsEngine?: string;
    preventSymbolication?: boolean;
    componentStack?: string;
};
// xport type ExtendedError = Error & {
//   jsEngine?: string,
//   preventSymbolication?: boolean,
//   componentStack?: string,
//   forceRedbox?: boolean,
//   isComponentError?: boolean,
//   ...
// };
const UNKNOWN_FUNCTION = undefined;

export interface NativescriptStackFrame extends StackFrame {
    native?: boolean;
}

// function createFrame(filename, func, lineno, colno) {

function createFrame(frame: Partial<NativescriptStackFrame>) {
    frame.in_app = (frame.filename && !frame.filename.includes('node_modules')) || (!!frame.colno && !!frame.lineno);
    frame.platform = frame.filename.endsWith('.js') ? 'javascript'  : 'android';


    return frame;
}

const nativescriptRegex =
  /^\s*at (?:(.*\).*?|.*?) ?\()?((?:file|native|webpack|<anonymous>|[-a-z]+:|.*bundle|\/)?.*?)(?::(\d+))?(?::(\d+))?\)?\s*$/i;

const nativescriptFunc = line => {
    const parts = nativescriptRegex.exec(line);
    if (parts) {
        return createFrame({
            filename:parts[2],
            platform:'javascript',
            function:parts[1] || UNKNOWN_FUNCTION,
            lineno:parts[3] ? +parts[3] : undefined,
            colno:parts[4] ? +parts[4] : undefined
        });
    }
    return null;
};

const nativescriptLineParser: StackLineParser = [30, nativescriptFunc];

const androidRegex =
  /^\s*(?:(.*\).*?|.*?) ?\()?((?:Native Method|[-a-z]+:)?.*?)(?::(\d+))?(?::(\d+))?\)?\s*$/i;

const androidFunc = line => {
    const parts = androidRegex.exec(line);
    if (parts) {
        let func = UNKNOWN_FUNCTION, mod;
        if (parts[1]) {
            const splitted = parts[1].split('.');
            func = splitted[splitted.length-1];
            mod = splitted.slice(0, -1).join('.');
        }
        if (!parts[2].endsWith('.java')) {
            return null;
        }
        return createFrame({
            filename:parts[2],
            function:func,
            module:mod,
            native: func && (func.indexOf('Native Method') !== -1),
            lineno:parts[3] ? +parts[3] : undefined,
            colno:parts[4] ? +parts[4] : undefined
        });
    }
    return null;
};

const androidLineParser: StackLineParser = [50, androidFunc];

const stackParser = stackParserFromStackParserOptions([nativescriptLineParser, androidLineParser]);

export function parseErrorStack(e: NativescriptError): StackFrame[] {
    const stack = e?.['stackTrace'] || e?.stack;
    if (!stack) {
        return [];
    }
    return stackParser(stack);
}

/** Tries to symbolicate the JS stack trace on the device. */
export class DebugSymbolicator implements Integration {
    /**
     * @inheritDoc
     */
    public name: string = DebugSymbolicator.id;
    /**
     * @inheritDoc
     */
    public static id: string = 'DebugSymbolicator';

    /**
     * @inheritDoc
     */
    public setupOnce(): void {
        console.log('setupOnce');
        addGlobalEventProcessor(async (event: Event, hint?: EventHint) => {
            const self = getCurrentHub().getIntegration(DebugSymbolicator);
            console.log('addGlobalEventProcessor', hint.originalException);
            if (!self || hint === undefined || hint.originalException === undefined) {
                return event;
            }
            // @ts-ignore
            const error: NativescriptError = hint.originalException;
            // const parseErrorStack = require('react-native/Libraries/Core/Devtools/parseErrorStack');
            const stack = parseErrorStack(error);
            console.log('stack', stack);
            console.log('event.exception?.values?.[0].stacktrace', event.exception?.values?.[0].stacktrace);
            // console.log('stack', stack);


            // Ideally this should go into contexts but android sdk doesn't support it
            event.extra = {
                ...event.extra,
                componentStack: error.componentStack,
                jsEngine: error.jsEngine
            };

            await self._symbolicate(event, stack);

            event.platform = 'node'; // Setting platform node makes sure we do not show source maps errors

            return event;
        });
    }

    /**
   * Symbolicates the stack on the device talking to local dev server.
   * Mutates the passed event.
   */
    private async _symbolicate(
        event: Event,
        stack: StackFrame[]
    ): Promise<void> {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            this._replaceFramesInEvent(event, stack);
        } catch (error) {
            if (error instanceof Error) {
                logger.warn(`Unable to symbolicate stack trace: ${error.message}`);
            }
        }
    }

    /**
     * Replaces the frames in the exception of a error.
     * @param event Event
     * @param frames StackFrame[]
     */
    private _replaceFramesInEvent(event: Event, frames: StackFrame[]): void {
        console.log('_replaceFramesInEvent');
        if (event.exception?.values?.[0].stacktrace) {
            event.exception.values[0].stacktrace.frames = frames.reverse();
        }
    }
}
