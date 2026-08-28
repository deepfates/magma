import type * as Party from 'partykit/server';
import {TinyBasePartyKitServer} from 'tinybase/persisters/persister-partykit-server';
import {
  applyTimerCommand,
  createTimer,
  materializeTimer,
  type TimerCommand,
  type TimerState,
} from '../src/domain/timer';

type Participant = {
  id: string;
  name: string;
  color: string;
  emoji: string;
  intention: string;
};

type ClientMessage =
  | {type: 'hello'; participant: Omit<Participant, 'id'>}
  | {type: 'timer.command'; command: TimerCommand}
  | {type: 'reaction'; emoji: string};

type Connection = Party.Connection<Participant>;

const TIMER_KEY = 'magma:timer';

export default class MagmaRoom extends TinyBasePartyKitServer {
  private timer: TimerState = createTimer();

  constructor(readonly room: Party.Room) {
    super(room);
    this.config.messagePrefix = 'tinybase:';
  }

  async onStart() {
    this.timer = (await this.room.storage.get<TimerState>(TIMER_KEY)) ?? createTimer();
  }

  onConnect(connection: Connection) {
    connection.send(JSON.stringify(this.snapshot()));
  }

  async onMessage(message: string, connection: Connection) {
    const custom = this.parseMessage(message);
    if (!custom) {
      await super.onMessage(message, connection);
      return;
    }

    if (custom.type === 'hello') {
      connection.setState({...custom.participant, id: connection.id});
      this.broadcastSnapshot();
      return;
    }

    if (custom.type === 'timer.command') {
      this.timer = applyTimerCommand(this.timer, custom.command, Date.now(), connection.id);
      await this.room.storage.put(TIMER_KEY, this.timer);
      this.broadcastSnapshot();
      return;
    }

    this.room.broadcast(
      JSON.stringify({
        type: 'reaction',
        id: crypto.randomUUID(),
        emoji: custom.emoji.slice(0, 8),
        from: connection.state?.name ?? 'Someone',
      }),
    );
  }

  onClose() {
    this.broadcastSnapshot();
  }

  private snapshot() {
    this.timer = materializeTimer(this.timer, Date.now());
    return {
      type: 'snapshot' as const,
      serverNow: Date.now(),
      timer: this.timer,
      participants: Array.from(this.room.getConnections<Participant>())
        .map((connection) => connection.state)
        .filter((participant): participant is Participant => Boolean(participant)),
    };
  }

  private broadcastSnapshot() {
    this.room.broadcast(JSON.stringify(this.snapshot()));
  }

  private parseMessage(message: string): ClientMessage | null {
    if (message.startsWith('tinybase:')) return null;
    try {
      const parsed = JSON.parse(message) as ClientMessage;
      return ['hello', 'timer.command', 'reaction'].includes(parsed.type) ? parsed : null;
    } catch {
      return null;
    }
  }
}

MagmaRoom satisfies Party.Worker;
