import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RunEvent, RunEventSchema } from './schemas/run-event.schema';
import { RunEventsController } from './run-events.controller';
import { RunEventsService } from './run-events.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RunEvent.name, schema: RunEventSchema },
    ]),
  ],
  controllers: [RunEventsController],
  providers: [RunEventsService],
  exports: [RunEventsService],
})
export class RunEventsModule {}
