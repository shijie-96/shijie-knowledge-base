import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaterialAnnotation } from '../../entities/material-annotation.entity';
import { SourceMaterial } from '../../entities/source-material.entity';
import { MaterialAnnotationController } from './material-annotation.controller';
import { MaterialAnnotationService } from './material-annotation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([MaterialAnnotation, SourceMaterial]),
  ],
  controllers: [MaterialAnnotationController],
  providers: [MaterialAnnotationService],
  exports: [MaterialAnnotationService],
})
export class MaterialAnnotationModule {}
