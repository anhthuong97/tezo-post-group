import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../../../../../core/guards/session.guard';
import { ProductService } from '../service/product.service';

@Controller('post-group/product')
@UseGuards(SessionGuard)
export class ProductController {
  constructor(private readonly product: ProductService) {}

  @Post('fetch')
  async fetch(@Body('url') url: string) {
    if (!url?.trim()) return { success: false, error: 'Thiếu URL sản phẩm' };
    const result = await this.product.fetchProduct(url.trim());
    return { success: true, content: result.content, imageFiles: result.imageFiles };
  }
}
