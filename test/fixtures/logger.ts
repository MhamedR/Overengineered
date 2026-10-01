export const loggerSource = `interface Logger {
  log(message: string): void;
}

class ConsoleLogger implements Logger {
  log(message: string) {
    console.log(message);
  }
}

class LoggerFactory {
  create(): Logger {
    return new ConsoleLogger();
  }
}

class LoggingService {
  constructor(private logger: Logger) {}

  log(message: string) {
    return this.logger.log(message);
  }
}
`;
