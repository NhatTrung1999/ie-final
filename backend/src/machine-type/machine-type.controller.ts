import { Controller, Get, Query } from '@nestjs/common';

import { MachineTypeService } from './machine-type.service';

@Controller('machine-types')
export class MachineTypeController {
  constructor(private readonly machineTypeService: MachineTypeService) {}

  @Get()
  getMachineTypes(@Query('department') department?: string) {
    return this.machineTypeService.listMachineTypes(department);
  }
}
