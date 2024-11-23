import { Logger } from '@duaneoli/base-project-nest';
import { DynamicModule, Global, Module } from '@nestjs/common';
import { DataSource, DataSourceOptions } from 'typeorm';
import { DashboardCacheEntity } from '../entities/DashboardCacheEntity';
import { DashboardEntity } from '../entities/DashboardEntity';
import { GraphicEntity } from '../entities/GraphicEntity';
import { VariablesEntity } from '../entities/VariablesEntity';
import { AuthorizationLibDefaultOwner } from '../helpers/AuthorizationLibVariables';
import { AuthenticationDataSource } from '../helpers/DataSource';
import { DashboardService } from '../services/DashboardService';
import { GraphicService } from '../services/GraphicService';
import { VariablesService } from '../services/VariablesService';
import { DecoratorConfig } from '../types/types';

@Global()
@Module({})
export class DashboardQueriesModule {
  static connection: DataSource;
  static config: DecoratorConfig;
  static forRoot(database: DataSourceOptions, config?: DecoratorConfig): DynamicModule {
    this.config = config;
    const entities = [VariablesEntity, DashboardEntity, DashboardCacheEntity, GraphicEntity];
    const services = [VariablesService, DashboardService, GraphicService];
    const exports = [...services];
    const providers = [...services];

    this.connection = new AuthenticationDataSource({
      ...database,
      entities,
      name: AuthorizationLibDefaultOwner,
    });

    if (!this.config.appName) this.config.appName = 'OM-DASHBOARD-QUERIES';
    if (this.config.debug) Logger.debug('DashboardQueriesModule Initialized');

    return {
      global: true,
      module: DashboardQueriesModule,
      providers,
      exports,
    };
  }

  async onModuleInit() {
    await DashboardQueriesModule.connection.initialize();
  }

  async onModuleDestroy() {
    await DashboardQueriesModule.connection.destroy();
  }
}
