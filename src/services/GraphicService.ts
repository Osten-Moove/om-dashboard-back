import { ServiceDTO } from '@duaneoli/base-project-nest';
import { Injectable } from '@nestjs/common';
import { all, create } from 'mathjs';
import { Repository } from 'typeorm';
import { DashboardEntity, GraphicEntity } from '../entities';
import { DashboardQueriesModule } from '../module/DashboardQueriesModule';
import { CreateGraphicType, DeleteGraphicType, UpdateGraphicType } from '../types/GraphicTypes';
import { VariablesService } from './VariablesService';

@Injectable()
export class GraphicService {
  private graphicRepository: Repository<GraphicEntity>;
  private dashboardRepository: Repository<DashboardEntity>;

  constructor() {
    this.graphicRepository = DashboardQueriesModule.connection.getRepository(GraphicEntity);
    this.dashboardRepository = DashboardQueriesModule.connection.getRepository(DashboardEntity);
  }

  async create(dashboardId: string, { title, type, metrics, dataFunctions }: CreateGraphicType) {
    const dashboardExists = await this.dashboardRepository.findOne({
      where: { id: dashboardId },
    });

    if (!dashboardExists) throw Error('Dashboard Not Found!');

    const createGraphic = await this.graphicRepository.save({
      title,
      metrics,
      type,
      dataFunctions,
      dashboard: {
        id: dashboardExists.id,
      },
    });

    return new ServiceDTO([createGraphic]);
  }

  async update({ id, ...query }: UpdateGraphicType) {
    const graphicExists = await this.graphicRepository.findOne({
      where: { id },
    });

    if (!graphicExists) throw Error('Graphic not found!');

    Object.assign(graphicExists, { ...query });

    const updateGraphic = await this.graphicRepository.save(graphicExists);

    return new ServiceDTO([updateGraphic]);
  }

  async delete(body: Array<DeleteGraphicType>) {
    const listErrors = [];

    const graphicExists = await Promise.all(
      body.map(async (item) => {
        const itemExists = await this.graphicRepository.findOne({
          where: { id: item.id },
        });

        if (!itemExists) {
          listErrors.push({
            type: 'not found',
            id: item.id,
          });
        }

        return itemExists;
      }),
    );

    if (listErrors.length === body.length) throw Error('Grafics were not found!');

    const filterGraphics = graphicExists.filter((item) => item !== null);

    await this.graphicRepository.delete(filterGraphics.map((item) => item.id));

    const response =
      listErrors.length > 0
        ? { message: 'partial deleted successfuly', errors: listErrors }
        : { message: 'all deleted successfully' };

    return new ServiceDTO([{ response }]);
  }

  async generateGraph(graph: GraphicEntity) {
    const graphData: any = graph;

    const dataFunctions = Object(graph.dataFunctions).variables;

    const convertVariablesToArray = Object.entries(dataFunctions).map(([key, value]) => {
      const convertValueToObject = Object(value);
      const getQueryValues = convertValueToObject.queries;

      const adjustQueryValues = {};
      Object.entries(getQueryValues).forEach(([queryKey, queryValue]) => {
        adjustQueryValues[queryKey] = queryValue;
      });

      const structureReturn = {
        identify: key,
        operation: convertValueToObject.operation,
        variables: adjustQueryValues,
      };

      return structureReturn;
    });

    const variableService = new VariablesService();
    const calculationResults = await variableService.operationCalcVariables(convertVariablesToArray);

    const scopeVariables = calculationResults.reduce((acc, entity) => {
      acc[entity.identify] = entity.result;
      return acc;
    }, {});

    const math = create(all);
    graphData.dataFunctions.data.map((dataPoint) => {
      Object.entries(dataPoint).forEach(([key, expression]: any) => {
        try {
          dataPoint[key] = math.compile(expression).evaluate(scopeVariables);
        } catch (cause) {
          throw Error(cause);
          dataPoint[key] = dataPoint[key];
        }
      });
    });

    return { title: graph.title, type: graph.type, data: graphData.dataFunctions.data };
  }

  private replaceParams(dataFunctions: string, params: Array<string>): string {
    return dataFunctions.replace(/\$(\d+)/g, (_, index: string) => {
      const i = parseInt(index) - 1;
      return params[i] || '';
    });
  }

  async generateMultipleGraphs(dashboardId: string, params: Array<string>) {
    const graphs = await this.graphicRepository.find({ where: { dashboard: { id: dashboardId } } });
    const graphsWithUnitsInserted = graphs.map((graph) => {
      const listQueries = JSON.stringify(graph.dataFunctions);
      const replaceVariablesParams = this.replaceParams(listQueries, params);

      Object.assign(graph, { dataFunctions: JSON.parse(replaceVariablesParams) });
      return graph;
    });

    const graph = await Promise.all(
      graphsWithUnitsInserted.map(async (graphic) => {
        const generateGraph = await this.generateGraph(graphic);

        const headers = Object.keys(generateGraph.data[0]);

        const resultStructure = {
          title: generateGraph.title,
          type: generateGraph.type,
          headers,
          dataBody: generateGraph.data,
        };

        return resultStructure;
      }),
    );

    return graph;
  }

  async searchGraphic(graphicId: string, params: string) {
    const findGraph = await this.graphicRepository.findOne({
      where: { id: graphicId },
    });

    if (!findGraph) throw Error('Grafic not found!');

    const replaceVariablesWithUnit = JSON.stringify(findGraph.dataFunctions).replaceAll('$1', params);

    Object.assign(findGraph, { dataFunctions: JSON.parse(replaceVariablesWithUnit) });

    const result = await this.generateGraph(findGraph);

    return result;
  }
}
