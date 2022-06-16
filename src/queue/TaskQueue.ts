export class TaskQueue {

    private queue: Function[];

    constructor() {
        this.queue = [];
    }

    public add(task: Function): void {
        this.queue.push(task);
    }

    public process(): void {
        if (this.queue.length !== 1) return;

        this.run();
    }

    public addAndProcess(task: Function): void {
        this.add(task);
        this.process();
    }

    private run(): void {
        const task: Function = this.queue[0];

        try {
            task();
        } catch (e) {
            console.error('Caught exception while executing task:');
            console.error(e);
        } finally {
            this.queue.shift();
            setTimeout(() => this.run, 1); // prevent eventual stack overflow if the queue is massive
        }
    }

};
