// Copyright (C) Microsoft Corporation. All rights reserved.

interface PerformanceArenaInitEvent extends Event {
	detail: {
		skipRecording: boolean;
	};
}

export type StageNameType = string;

export type StageExecutionType = 'sync' | 'async';

export type StageExtenedType = {
	name: StageNameType;
	type?: StageExecutionType;
};

export type StagePerfData = {
	currentRefTime: number | Array<number>;
	totalCycles: number;
	recentCycles: Array<{ r: number; t: number }>;
};

export type Stage = StageNameType | StageExtenedType;

export type OnPurgeCallbackType = (name: string, records: StagePerfData) => void;

const nowFn = performance ? performance.now.bind(performance) : Date.now.bind(Date);

export default class PerformanceArena {
	private stages: Stage[];
	private records: Record<StageNameType, StagePerfData>;
	private cache: Record<StageNameType, StageExecutionType>;
	private skipRecording: boolean;
	private enableLiveDebug: boolean;
	private inMemCycles: number;
	private onPurgeCallback: OnPurgeCallbackType | undefined;

	public constructor(
		stages: Stage[],
		skipRecording?: boolean,
		inMemCycles?: number,
		enableLiveDebug?: boolean,
		onPurgeCallback?: OnPurgeCallbackType
	) {
		this.stages = [];
		this.records = {};
		this.cache = {};
		this.skipRecording = !!skipRecording;
		this.enableLiveDebug = !!enableLiveDebug;
		this.inMemCycles = enableLiveDebug ? inMemCycles || 250 : 1;
		this.onPurgeCallback = onPurgeCallback;
		this.initializePerformanceData(stages);
		if (this.enableLiveDebug) {
			this.listenForEventsPerformanceData();
		}
	}

	public startStage(name: StageNameType): void {
		if (!this.skipRecording && this.records[name]) {
			const perfNow = nowFn();
			const type = this.cache[name];
			const record = this.records[name];
			if (type === 'sync') {
				record.currentRefTime = perfNow;
			} else {
				(record.currentRefTime as Array<number>).push(perfNow);
			}
		}
	}

	public endStage(name: StageNameType, event?: PointerEvent): void {
		if (!this.skipRecording && this.records[name]) {
			const perfNow = nowFn();
			const type = this.cache[name];
			const record = this.records[name];
			let currentRefTime;
			if (event) {
				currentRefTime = event.timeStamp;
			} else if (type === 'sync') {
				currentRefTime = record.currentRefTime as number;
			} else {
				currentRefTime = (record.currentRefTime as Array<number>).shift();
			}
			if (!currentRefTime) {
				// Reference time not set for stage. Return.
				return;
			}
			this.markTime(name, currentRefTime, perfNow - currentRefTime);
			if (!event && type === 'sync') {
				record.currentRefTime = 0;
			}

			if (this.enableLiveDebug) {
				if (record.recentCycles.length >= this.inMemCycles) {
					record.recentCycles.shift();
				}
			} else {
				this.purgeArena(name);
			}
		}
	}

	public getStageArena(name: string): StagePerfData {
		return this.records[name];
	}

	private purgeArena(name: string): void {
		this.onPurgeCallback?.(name, JSON.parse(JSON.stringify(this.records[name])));
		this.records[name].recentCycles = [];
	}

	private initializePerformanceData(stages: Stage[], forceInitialize?: boolean): void {
		stages.forEach((stage) => {
			const s: Stage = typeof stage === 'string' ? { name: stage, type: 'sync' } : stage;
			s.type = s.type || 'sync';
			if (this.records[s.name] && !forceInitialize) {
				throw new Error(`Found duplicate performance stage ${s}. Aborting...`);
			}
			const stageRecord = {
				currentRefTime: s.type === 'async' ? [] : 0,
				totalCycles: 0,
				recentCycles: []
			};
			this.stages.push(s);
			this.records[s.name] = stageRecord;
			this.cache[s.name] = s.type;
		});

		if (this.enableLiveDebug) {
			window.performanceArena = this.records;
		}
	}

	private markTime(name: StageNameType, refTime: number, totalTime: number): void {
		const record = this.records[name];
		const { recentCycles } = record;
		recentCycles.push({ r: refTime, t: totalTime });
		record.totalCycles++;
	}

	// Enabled ONLY in development mode.
	private listenForEventsPerformanceData(): void {
		window.addEventListener('reset-performance-data', () => {
			this.initializePerformanceData(this.stages, true);
		});
		window.addEventListener('init-performance-data', (e: Event) => {
			this.skipRecording = (e as PerformanceArenaInitEvent).detail.skipRecording;
		});
	}
}
