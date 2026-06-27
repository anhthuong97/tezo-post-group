export interface ProductVariant { title: string; price: string; available: boolean; }

export interface Product {
  title:       string;
  description: string;
  price:       string;
  vendor:      string;
  tags:        string;
  images:      string[];
  variants:    ProductVariant[];
}

export interface ProductFetchResponse { success: boolean; product: Product; }
