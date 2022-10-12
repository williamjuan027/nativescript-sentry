import { BrowserOptions, Transports } from '@sentry/browser';
import { BrowserBackend } from '@sentry/browser/dist/backend';
import { BaseBackend, NoopTransport } from '@sentry/core';
import { CaptureContext, Event, EventHint, Severity, Transport } from '@sentry/types';
import { SyncPromise } from '@sentry/utils';

import { NativeTransport } from './transports/native';
import { NSSentry } from './nssentry';

// const { NSSentry } = NativeModules;

/**
 * Configuration options for the Sentry Nativescript SDK.
 * @see NativescriptFrontend for more information.
 */
export interface NativescriptOptions extends BrowserOptions {
    /**
     * Enables native transport + device info + offline caching.
     * Be careful, disabling this also breaks automatic release setting.
     * This means you have to manage setting the release yourself.
     * Defaults to `true`.
     */
    enableNative?: boolean;

    enableAutoSessionTracking?: boolean;

    /**
     * Enables native crashHandling. This only works if `enableNative` is `true`.
     * Defaults to `true`.
     */
    enableNativeCrashHandling?: boolean;

    /** Maximum time to wait to drain the request queue, before the process is allowed to exit. */
    shutdownTimeout?: number;

    sessionTrackingIntervalMillis?: number;

    /** Enable scope sync from Java to NDK on Android */
    enableNdkScopeSync?: boolean;

    /** When enabled, all the threads are automatically attached to all logged events on Android */
    attachThreads?: boolean;

    /**
     *  When enabled, certain personally identifiable information (PII) is added by active integrations.
     *
     * @default false
     * */
    sendDefaultPii?: boolean;

    /** Should the native nagger alert be shown or not. */
    // enableNativeNagger?: boolean;
    /**
     * Optional prefix to add while rewriting frames
     */
    appPrefix?: string;

    traceErrorHandler?: boolean;
    uncaughtErrors?: boolean;

    breadcrumbs?: {
        console?: boolean;
        dom?: boolean;
        fetch?: boolean;
        history?: boolean;
        sentry?: boolean;
        xhr?: boolean;
    };

    /** Enable auto performance tracking by default. */
    enableAutoPerformanceTracking?: boolean;

    flushSendEvent?: boolean;

    /**
   * Enables Out of Memory Tracking for iOS and macCatalyst.
   * See the following link for more information and possible restrictions:
   * https://docs.sentry.io/platforms/apple/guides/ios/configuration/out-of-memory/
   *
   * @default true
   * */
    enableOutOfMemoryTracking?: boolean;

    /**
     * Set data to the inital scope
     * @deprecated Use `Sentry.configureScope(...)`
     */
    initialScope?: CaptureContext;

    headers?: {[k: string]: string};


    beforeSend?(event: any, hint?);
}

/** The Sentry Nativescript SDK Backend. */
export class NativescriptBackend extends BaseBackend<BrowserOptions> {
    private readonly _browserBackend: BrowserBackend;

    /** Creates a new Nativescript backend instance. */
    public constructor(protected readonly _options: NativescriptOptions) {
        super(_options);
        this._browserBackend = new BrowserBackend(_options);

        if (_options.enableNative !== false) {
            NSSentry.startWithOptions(_options.dsn, _options);
        }
    }

    /**
     * @inheritDoc
     */
    protected _setupTransport(): Transport {
        if (!this._options.dsn) {
            // We return the noop transport here in case there is no Dsn.
            return new NoopTransport();
        }

        const transportOptions = {
            ...this._options.transportOptions,
            dsn: this._options.dsn
        };

        if (this._options.transport) {
            return new this._options.transport(transportOptions);
        }

        if (this._isNativeTransportAvailable()) {
            return new NativeTransport();
        }

        return new Transports.FetchTransport(transportOptions);
    }

    /**
     * If true, native client is availabe and active
     */
    private _isNativeTransportAvailable(): boolean {
        return NSSentry.nativeClientAvailable && NSSentry.nativeTransport;
    }

    /**
     * If native client is available it will trigger a native crash.
     * Use this only for testing purposes.
     */
    public nativeCrash(): void {
        if (this._options.enableNative) {
            // tslint:disable-next-line: no-unsafe-any
            NSSentry.crash();
        }
    }

    /**
     * @inheritDoc
     */
    public eventFromException(exception: any, hint?: EventHint): SyncPromise<Event> {
        return this._browserBackend.eventFromException(exception, hint) as any;
    }

    /**
     * @inheritDoc
     */
    public eventFromMessage(message: string, level: Severity = Severity.Info, hint?: EventHint): SyncPromise<Event> {
        return this._browserBackend.eventFromMessage(message, level, hint) as any;
    }
}

/**
 * Convert js severity level which has critical and log to more widely supported levels.
 * @param level
 * @returns More widely supported Severity level strings
 */
export function _processLevel(level: Severity): Severity {
    if (level === Severity.Critical) {
        return Severity.Fatal;
    }
    if (level === Severity.Log) {
        return Severity.Debug;
    }

    return level;
}
